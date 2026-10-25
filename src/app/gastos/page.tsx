"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { Expense, ExpenseCategory } from "@/types/domain";

type InventoryUnit = "unidades" | "kilos" | "litros";

interface ScannedItem {
  name: string;
  qty: number;
  unit: InventoryUnit;
  unitPrice: number | null;
  lineTotal: number | null;
}

interface ScannedReceipt {
  total: number;
  spentAt: string;
  merchant: string | null;
  receiptNumber: string | null;
  items: ScannedItem[];
}

const UNIT_LABEL: Record<InventoryUnit, string> = { unidades: "Unidades", kilos: "Kilos", litros: "Litros" };

/** Redimensiona y comprime la foto en el navegador antes de subirla (boletas pueden pesar varios MB). */
async function compressReceiptImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

interface SummaryResponse {
  total: number;
  byCategory: Array<{ categoryId: string | null; categoryName: string | null; total: number; count: number }>;
  budgets: Array<{ categoryId: string; categoryName: string; limit: number; spent: number; percentage: number }>;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [savingScan, setSavingScan] = useState(false);
  const [preview, setPreview] = useState<ScannedReceipt | null>(null);
  const [possibleDuplicate, setPossibleDuplicate] = useState(false);

  async function loadAll() {
    const { from, to } = monthRange();
    const [e, c, s] = await Promise.all([
      api.get<{ expenses: Expense[] }>("/api/expenses"),
      api.get<{ categories: ExpenseCategory[] }>("/api/categories"),
      api.get<SummaryResponse>(`/api/expenses/summary?from=${from}&to=${to}`),
    ]);
    setExpenses(e.expenses);
    setCategories(c.categories);
    setSummary(s);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (!value) return;
    await api.post("/api/expenses", {
      amount: value,
      description: description || null,
      categoryId: categoryId || null,
    });
    setAmount("");
    setDescription("");
    setCategoryId("");
    loadAll();
  }

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setEditAmount(String(Math.round(Number(e.amount))));
    setEditDescription(e.description ?? e.merchant ?? "");
    setEditCategoryId(e.category_id ?? "");
  }

  async function saveEdit(id: string) {
    const value = Number(editAmount.replace(/[^\d]/g, ""));
    if (!value) return;
    await api.patch(`/api/expenses/${id}`, {
      amount: value,
      description: editDescription || null,
      categoryId: editCategoryId || null,
    });
    setEditingId(null);
    loadAll();
  }

  async function removeExpense(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await api.delete(`/api/expenses/${id}`);
    loadAll();
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    const { category } = await api.post<{ category: ExpenseCategory }>("/api/categories", { name });
    setNewCategoryName("");
    setAddingCategory(false);
    setCategoryId(category.id);
    loadAll();
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanError(null);
    setScanning(true);
    try {
      const image = await compressReceiptImage(file);
      const res = await api.post<{ parsed: ScannedReceipt; possibleDuplicate: boolean }>("/api/boletas/procesar", {
        image,
      });
      setPreview(res.parsed);
      setPossibleDuplicate(res.possibleDuplicate);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "No pudimos leer la boleta.");
    } finally {
      setScanning(false);
    }
  }

  function updatePreviewItem(index: number, patch: Partial<ScannedItem>) {
    setPreview((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return { ...prev, items };
    });
  }

  function removePreviewItem(index: number) {
    setPreview((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : prev));
  }

  function cancelScan() {
    setPreview(null);
    setPossibleDuplicate(false);
    setScanError(null);
  }

  async function confirmScan() {
    if (!preview) return;
    setSavingScan(true);
    setScanError(null);
    try {
      await api.post("/api/boletas/confirmar", preview);
      cancelScan();
      loadAll();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "No pudimos guardar la boleta.");
    } finally {
      setSavingScan(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Control de Gastos</h1>
        <p className="text-sm text-muted">Registra un gasto en segundos.</p>
      </header>

      {!loading && summary && (
        <div className="card p-4">
          <p className="text-xs text-muted">Gastado este mes</p>
          <p className="text-2xl font-bold">{money(summary.total)}</p>
          {summary.byCategory.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {summary.byCategory.slice(0, 5).map((c) => (
                <div key={c.categoryId ?? "sin-categoria"} className="flex justify-between text-sm">
                  <span className="text-muted">{c.categoryName ?? "Sin categoría"}</span>
                  <span className="font-medium">{money(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          {summary.budgets.some((b) => b.percentage >= 0.9) && (
            <p className="text-xs text-priority-red mt-2">
              ⚠️ Estás cerca o sobre el presupuesto en{" "}
              {summary.budgets
                .filter((b) => b.percentage >= 0.9)
                .map((b) => b.categoryName)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}

      <form onSubmit={addExpense} className="card p-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto"
            inputMode="numeric"
            className="w-28 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
          >
            <option value="">Categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAddingCategory((v) => !v)}
            title="Crear una categoría nueva"
            className="shrink-0 rounded-xl border px-3 py-2 text-sm"
          >
            + Categoría
          </button>
        </div>
        {addingCategory && (
          <div className="flex gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nombre de la categoría (ej. Servicios Básicos)"
              className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
            <button
              type="button"
              onClick={addCategory}
              className="shrink-0 rounded-xl bg-primary text-white px-4 text-sm font-medium"
            >
              Crear
            </button>
          </div>
        )}
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
        />
        <button className="w-full rounded-xl bg-primary text-white py-2.5 text-sm font-semibold">
          Registrar gasto
        </button>
      </form>

      <div className="card p-4 space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleReceiptFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          className="w-full rounded-xl border-2 border-dashed border-primary/40 text-primary py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {scanning ? "Leyendo boleta…" : "📷 Leer boleta del supermercado"}
        </button>
        {scanError && <p className="text-xs text-priority-red">{scanError}</p>}
      </div>

      {preview && (
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Revisa la boleta antes de guardar</h2>
          {possibleDuplicate && (
            <p className="text-xs text-priority-red bg-priority-red/10 rounded-lg px-2 py-1.5">
              ⚠️ Ya existe un gasto con la misma fecha y monto — revisa que no sea la misma boleta.
            </p>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted">Total</label>
              <input
                type="number"
                value={preview.total}
                onChange={(e) => setPreview({ ...preview, total: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted">Fecha</label>
              <input
                type="date"
                value={preview.spentAt}
                onChange={(e) => setPreview({ ...preview, spentAt: e.target.value })}
                className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
            </div>
          </div>
          <input
            value={preview.merchant ?? ""}
            onChange={(e) => setPreview({ ...preview, merchant: e.target.value || null })}
            placeholder="Tienda (opcional)"
            className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
          />

          {preview.items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted">Productos leídos ({preview.items.length})</p>
              <div className="divide-y rounded-xl border">
                {preview.items.map((item, i) => (
                  <div key={i} className="p-2.5 space-y-1.5">
                    <div className="flex gap-2 items-center">
                      <input
                        value={item.name}
                        onChange={(e) => updatePreviewItem(i, { name: e.target.value })}
                        className="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm bg-transparent"
                      />
                      <button onClick={() => removePreviewItem(i)} className="text-muted shrink-0" title="Quitar">
                        🗑
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updatePreviewItem(i, { qty: Number(e.target.value) || 1 })}
                        className="w-20 rounded-lg border px-2 py-1.5 text-sm bg-transparent"
                      />
                      <select
                        value={item.unit}
                        onChange={(e) => updatePreviewItem(i, { unit: e.target.value as InventoryUnit })}
                        className="flex-1 rounded-lg border px-2 py-1.5 text-sm bg-transparent"
                      >
                        {(Object.keys(UNIT_LABEL) as InventoryUnit[]).map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABEL[u]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmScan}
              disabled={savingScan}
              className="flex-1 rounded-xl bg-primary text-white py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {savingScan ? "Guardando…" : "Guardar gasto y actualizar inventario"}
            </button>
            <button onClick={cancelScan} className="px-4 text-sm text-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">RECIENTES</h2>
        <div className="card divide-y">
          {!loading && expenses.length === 0 && <p className="text-sm text-muted p-4">Sin gastos registrados.</p>}
          {expenses.slice(0, 15).map((e) => (
            <div key={e.id} className="px-4 py-3">
              {editingId === e.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={editAmount}
                      onChange={(ev) => setEditAmount(ev.target.value)}
                      placeholder="Monto"
                      inputMode="numeric"
                      className="w-28 rounded-xl border px-3 py-2 text-sm bg-transparent"
                    />
                    <select
                      value={editCategoryId}
                      onChange={(ev) => setEditCategoryId(ev.target.value)}
                      className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
                    >
                      <option value="">Categoría</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    value={editDescription}
                    onChange={(ev) => setEditDescription(ev.target.value)}
                    placeholder="Descripción"
                    className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(e.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white font-medium"
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 text-muted">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{e.description || e.merchant || "Gasto"}</p>
                    <p className="text-xs text-muted">{e.spent_at}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-semibold">{money(Number(e.amount))}</p>
                    <button onClick={() => startEdit(e)} className="text-muted" title="Editar" aria-label="Editar">
                      ✎
                    </button>
                    <button
                      onClick={() => removeExpense(e.id)}
                      className="text-muted"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
