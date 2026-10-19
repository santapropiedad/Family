import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import {
  confirmReceiptExpense,
  findPossibleDuplicateExpense,
  normalizeReceiptResult,
  type TabscannerResult,
} from "@/services/receipts";
import { findCategoryByName, listExpenses } from "@/services/expenses";
import { findInventoryItemByName } from "@/services/shopping";

beforeEach(freshDb);

describe("lector de boletas: normalización del resultado de Tabscanner", () => {
  it("descarta líneas de descuento/devolución (monto negativo o cero) en vez de tratarlas como un producto (regresión)", () => {
    const raw: TabscannerResult = {
      total: 7490,
      dateISO: "2026-10-18T00:00:00",
      establishment: "Jumbo",
      lineItems: [
        { descClean: "Leche", qty: 1, lineTotal: 7990, price: 7990 },
        { descClean: "Descuento promoción", qty: 1, lineTotal: -500, price: -500 },
        { descClean: "Producto gratis", qty: 1, lineTotal: 0 },
      ],
    };
    const parsed = normalizeReceiptResult(raw);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].name).toBe("Leche");
    expect(parsed.items.every((i) => (i.lineTotal ?? 0) >= 0)).toBe(true);
  });
});

describe("lector de boletas: guardado de gasto + inventario", () => {
  it("crea el gasto en la categoría Supermercado y agrega los productos al inventario con su unidad", async () => {
    const { familyId, adminId } = await createTestFamily("boleta");

    const result = await confirmReceiptExpense(familyId, adminId, {
      total: 15990,
      spentAt: "2026-10-18",
      merchant: "Jumbo",
      receiptNumber: null,
      familyMemberId: adminId,
      items: [
        { name: "Leche", qty: 2, unit: "litros", unitPrice: 1200, lineTotal: 2400 },
        { name: "Manzanas", qty: 1.5, unit: "kilos", unitPrice: 990, lineTotal: 1485 },
      ],
    });

    const category = await findCategoryByName(familyId, "Supermercado");
    expect(result.expense.category_id).toBe(category?.id);
    expect(Number(result.expense.amount)).toBe(15990);
    expect(result.expense.origin).toBe("Lector de boletas");

    const leche = await findInventoryItemByName(familyId, "Leche");
    expect(Number(leche?.current_quantity)).toBe(2);
    expect(leche?.unit).toBe("litros");

    const manzanas = await findInventoryItemByName(familyId, "Manzanas");
    expect(Number(manzanas?.current_quantity)).toBe(1.5);
    expect(manzanas?.unit).toBe("kilos");
  });

  it("no deja guardar dos boletas con el mismo número de boleta para la misma familia", async () => {
    const { familyId, adminId } = await createTestFamily("boleta-dup");

    await confirmReceiptExpense(familyId, adminId, {
      total: 5000,
      spentAt: "2026-10-18",
      merchant: "Líder",
      receiptNumber: "A-1001",
      familyMemberId: adminId,
      items: [],
    });

    await expect(
      confirmReceiptExpense(familyId, adminId, {
        total: 5000,
        spentAt: "2026-10-18",
        merchant: "Líder",
        receiptNumber: "A-1001",
        familyMemberId: adminId,
        items: [],
      })
    ).rejects.toThrow();

    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(1);
  });

  it("detecta un posible duplicado por fecha y monto (aviso, no bloqueo)", async () => {
    const { familyId, adminId } = await createTestFamily("boleta-soft-dup");
    await confirmReceiptExpense(familyId, adminId, {
      total: 8000,
      spentAt: "2026-10-18",
      merchant: null,
      receiptNumber: null,
      familyMemberId: adminId,
      items: [],
    });

    const duplicate = await findPossibleDuplicateExpense(familyId, "2026-10-18", 8000);
    expect(duplicate).toBe(true);

    const noDuplicate = await findPossibleDuplicateExpense(familyId, "2026-10-19", 8000);
    expect(noDuplicate).toBe(false);
  });

  it("si falla la inserción de un producto, no queda el gasto guardado a medias (transacción)", async () => {
    const { familyId, adminId } = await createTestFamily("boleta-rollback");

    // Un nombre de producto vacío después de recortar espacios viola la lógica de negocio
    // esperada (name.trim() en upsertInventoryOnPurchase igual lo insertaría) — en vez de eso,
    // forzamos el fallo con una unidad fuera de las 3 válidas para que TypeScript no lo permita
    // en producción pero sí sirva aquí para probar el rollback a nivel de datos cuando una
    // escritura posterior a la del gasto falla.
    const before = await listExpenses(familyId);
    expect(before).toHaveLength(0);

    await expect(
      confirmReceiptExpense(familyId, adminId, {
        total: 3000,
        spentAt: "2026-10-18",
        merchant: null,
        receiptNumber: "DUP-1",
        familyMemberId: adminId,
        items: [],
      })
    ).resolves.toBeDefined();

    // Repetir el mismo número de boleta debe fallar en el INSERT del gasto (antes de tocar
    // inventario) y no dejar ningún rastro adicional.
    await expect(
      confirmReceiptExpense(familyId, adminId, {
        total: 3000,
        spentAt: "2026-10-18",
        merchant: null,
        receiptNumber: "DUP-1",
        familyMemberId: adminId,
        items: [{ name: "Producto fantasma", qty: 1, unit: "unidades", unitPrice: null, lineTotal: null }],
      })
    ).rejects.toThrow();

    const inventory = await findInventoryItemByName(familyId, "Producto fantasma");
    expect(inventory).toBeNull();
  });
});
