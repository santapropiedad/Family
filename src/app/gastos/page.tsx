"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { Expense, ExpenseCategory } from "@/types/domain";

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
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
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function scanReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    setScanMessage(null);
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      const res = await api.post<{ expense: Expense }>("/api/expenses/scan-receipt", {
        imageBase64: base64,
        mimeType,
      });
      setScanMessage(
        `Boleta registrada: ${money(Number(res.expense.amount))}${
          res.expense.merchant ? ` en ${res.expense.merchant}` : ""
        }.`
      );
      loadAll();
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : "No se pudo leer la boleta.");
    } finally {
      setScanning(false);
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

      <div className="space-y-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={scanReceipt}
        />
        <button
          type="button"
          disabled={scanning}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border border-dashed px-4 py-2.5 text-sm font-medium text-center disabled:opacity-60"
        >
          {scanning ? "Leyendo boleta…" : "📷 Escanear boleta y registrar gasto"}
        </button>
        {scanMessage && <p className="text-xs text-muted text-center">{scanMessage}</p>}
      </div>

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
        </div>
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

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">RECIENTES</h2>
        <div className="card divide-y">
          {!loading && expenses.length === 0 && <p className="text-sm text-muted p-4">Sin gastos registrados.</p>}
          {expenses.slice(0, 15).map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm">{e.description || e.merchant || "Gasto"}</p>
                <p className="text-xs text-muted">{e.spent_at}</p>
              </div>
              <p className="text-sm font-semibold">{money(Number(e.amount))}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
