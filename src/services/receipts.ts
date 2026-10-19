import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";
import { createExpense, findCategoryByName } from "@/services/expenses";
import { upsertInventoryOnPurchase } from "@/services/shopping";
import type { Expense, InventoryItem } from "@/types/domain";

// API v2 de Tabscanner (api3.tabscanner.com) — la versión anterior (api.tabscanner.com/api/2/...)
// quedó obsoleta; verificado contra la documentación oficial vigente antes de implementar esto.
const TABSCANNER_RECEIPTS_URL = "https://api3.tabscanner.com/v2/receipts";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 55_000; // bajo el límite de 60s de las funciones de Vercel en el plan gratuito

export function isTabscannerConfigured(): boolean {
  return Boolean(process.env.TABSCANNER_API_KEY);
}

function tabscannerApiKey(): string {
  const key = process.env.TABSCANNER_API_KEY;
  if (!key) {
    throw new AppError(
      "El lector de boletas no está configurado todavía. Falta la clave de la API de Tabscanner.",
      503,
      "tabscanner_not_configured"
    );
  }
  return key;
}

function tabscannerHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${tabscannerApiKey()}` };
}

interface SubmitReceiptResult {
  token: string;
  /** Tabscanner detectó que esta misma imagen (por huella visual) ya se había subido antes. */
  duplicate: boolean;
}

/** Sube la foto de la boleta a Tabscanner y devuelve el token para consultar el resultado. */
async function submitReceiptImage(imageDataUrl: string): Promise<SubmitReceiptResult> {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    throw new AppError("La imagen de la boleta no tiene un formato válido.", 400, "invalid_image");
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), "boleta.jpg");
  form.append("region", "cl");

  const res = await fetch(TABSCANNER_RECEIPTS_URL, {
    method: "POST",
    headers: { ...tabscannerHeaders(), "Idempotency-Key": randomUUID() },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.token) {
    throw new AppError("No pudimos enviar la boleta a procesar. Inténtalo nuevamente.", 502, "tabscanner_submit_failed");
  }
  return { token: body.token as string, duplicate: Boolean(body.duplicate) };
}

export interface TabscannerLineItem {
  descClean?: string | null;
  desc?: string | null;
  qty?: number | null;
  unit?: string | null;
  price?: number | null;
  lineTotal?: number | null;
}

export interface TabscannerResult {
  total?: number | null;
  date?: string | null;
  dateISO?: string | null;
  establishment?: string | null;
  customFields?: { ReceiptNumber?: string | null } | null;
  lineItems?: TabscannerLineItem[] | null;
}

/** Consulta el resultado repetidamente (como indica la API) hasta que quede en estado "done". */
async function pollReceiptResult(token: string): Promise<TabscannerResult> {
  const headers = tabscannerHeaders();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${TABSCANNER_RECEIPTS_URL}/${token}`, { headers });
    const body = await res.json().catch(() => null);
    if (body?.status === "done" && body?.result) {
      return body.result as TabscannerResult;
    }
    if (body?.status === "failed") {
      throw new AppError("No pudimos leer la boleta. Prueba con una foto más clara.", 502, "tabscanner_failed");
    }
    if (body?.status !== "pending") {
      throw new AppError("No pudimos leer la boleta. Prueba con una foto más clara.", 502, "tabscanner_failed");
    }
    const retryAfterSeconds = Number(res.headers.get("Retry-After"));
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : DEFAULT_POLL_INTERVAL_MS;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new AppError("La boleta está tardando demasiado en procesarse. Inténtalo nuevamente.", 504, "tabscanner_timeout");
}

export type InventoryUnit = "unidades" | "kilos" | "litros";

export interface ParsedReceiptItem {
  name: string;
  qty: number;
  unit: InventoryUnit;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface ParsedReceipt {
  total: number;
  spentAt: string;
  merchant: string | null;
  receiptNumber: string | null;
  items: ParsedReceiptItem[];
}

/** Traduce la unidad libre que devuelve el OCR a una de las tres que usa el inventario de la app. */
function normalizeUnit(raw: string | null | undefined): InventoryUnit {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("kg") || value.includes("kilo")) return "kilos";
  if (value.includes("lt") || value.includes("litro") || value === "l") return "litros";
  return "unidades";
}

export function normalizeReceiptResult(raw: TabscannerResult): ParsedReceipt {
  if (!raw.total) {
    throw new AppError("No pudimos leer el monto total de la boleta. Pruebas con una foto más clara.", 422, "tabscanner_unreadable");
  }
  const spentAt = (raw.dateISO ?? raw.date ?? new Date().toISOString()).slice(0, 10);
  const items: ParsedReceiptItem[] = (raw.lineItems ?? [])
    // Descarta líneas de descuento/devolución (monto negativo o cero) y de propina/redondeo —
    // no son productos comprados, así que no tiene sentido sumarlas al inventario.
    .filter((item) => (item.descClean || item.desc) && item.lineTotal && item.lineTotal > 0)
    .map((item) => ({
      name: (item.descClean || item.desc || "Producto").trim(),
      qty: item.qty && item.qty > 0 ? item.qty : 1,
      unit: normalizeUnit(item.unit),
      unitPrice: item.price && item.price > 0 ? item.price : null,
      lineTotal: item.lineTotal ?? null,
    }));
  return {
    total: Math.round(raw.total * 100) / 100,
    spentAt,
    merchant: raw.establishment?.trim() || null,
    receiptNumber: raw.customFields?.ReceiptNumber?.trim() || null,
    items,
  };
}

export interface ProcessReceiptResult {
  parsed: ParsedReceipt;
  /** Tabscanner reconoció esta misma foto (por huella visual) como ya subida antes. */
  tabscannerDuplicate: boolean;
}

/** Procesa una foto de boleta de principio a fin: la sube, espera el resultado y lo normaliza. */
export async function processReceiptImage(imageDataUrl: string): Promise<ProcessReceiptResult> {
  const { token, duplicate } = await submitReceiptImage(imageDataUrl);
  const raw = await pollReceiptResult(token);
  return { parsed: normalizeReceiptResult(raw), tabscannerDuplicate: duplicate };
}

/**
 * Aviso no bloqueante: ¿ya existe un gasto muy parecido (misma fecha y monto) para esta familia?
 * El número de boleta es más confiable, pero Tabscanner sólo lo entrega si la cuenta lo tiene
 * configurado — por eso esto es una advertencia que el usuario puede descartar, no un bloqueo duro.
 */
export async function findPossibleDuplicateExpense(
  familyId: string,
  spentAt: string,
  total: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db.query<{ id: string }>(
    `SELECT id FROM expenses WHERE family_id = $1 AND spent_at = $2 AND amount = $3 LIMIT 1`,
    [familyId, spentAt, total]
  );
  return result.rows.length > 0;
}

export interface ConfirmReceiptInput {
  total: number;
  spentAt: string;
  merchant: string | null;
  receiptNumber: string | null;
  familyMemberId: string | null;
  items: ParsedReceiptItem[];
}

export interface ConfirmReceiptResult {
  expense: Expense;
  inventoryItems: InventoryItem[];
}

/**
 * Guarda la boleta ya revisada por el usuario: crea el gasto (categoría "Supermercado") y
 * actualiza/agrega cada producto al inventario, todo en una sola transacción — si algo falla,
 * no queda ni el gasto ni parte del inventario a medio guardar.
 */
export async function confirmReceiptExpense(
  familyId: string,
  createdBy: string,
  input: ConfirmReceiptInput
): Promise<ConfirmReceiptResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const category = await findCategoryByName(familyId, "Supermercado", tx);

    const expense = await createExpense(
      familyId,
      {
        amount: input.total,
        categoryId: category?.id ?? null,
        familyMemberId: input.familyMemberId,
        spentAt: input.spentAt,
        merchant: input.merchant,
        description: input.merchant ? `Boleta — ${input.merchant}` : "Boleta de supermercado",
        receiptNumber: input.receiptNumber,
        origin: "Lector de boletas",
        source: "ai",
        createdBy,
      },
      tx
    );

    const inventoryItems: InventoryItem[] = [];
    for (const item of input.items) {
      const inventoryItem = await upsertInventoryOnPurchase(
        familyId,
        item.name,
        {
          quantityDelta: item.qty,
          unit: item.unit,
          price: item.unitPrice ?? item.lineTotal ?? null,
          categoryId: category?.id ?? null,
          store: "Supermercado",
        },
        tx
      );
      inventoryItems.push(inventoryItem);
    }

    return { expense, inventoryItems };
  });
}
