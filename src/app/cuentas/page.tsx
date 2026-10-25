"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Bill } from "@/types/domain";

const FREQUENCY_LABEL: Record<Bill["frequency"], string> = {
  once: "Una vez",
  monthly: "Mensual",
  bimonthly: "Cada 2 meses",
  quarterly: "Trimestral",
  annual: "Anual",
};

const STATUS_LABEL: Record<Bill["status"], string> = {
  pending: "Pendiente",
  overdue: "Vencida",
  paid: "Pagada",
};

const STATUS_DOT: Record<Bill["status"], string> = {
  pending: "yellow",
  overdue: "red",
  paid: "green",
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export default function CuentasPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState<Bill["frequency"]>("monthly");

  async function loadAll() {
    const { bills } = await api.get<{ bills: Bill[] }>("/api/bills");
    setBills(bills);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addBill(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (!name.trim() || !value || !dueDate) return;
    await api.post("/api/bills", {
      name: name.trim(),
      provider: provider.trim() || null,
      amount: value,
      dueDate,
      frequency,
    });
    setName("");
    setProvider("");
    setAmount("");
    setDueDate("");
    setFrequency("monthly");
    loadAll();
  }

  async function markPaid(id: string) {
    if (!confirm("¿Marcar esta cuenta como pagada? Esto registrará el gasto correspondiente.")) return;
    await api.post(`/api/bills/${id}/pay`);
    loadAll();
  }

  async function removeBill(id: string) {
    if (!confirm("¿Eliminar esta cuenta? Esta acción no se puede deshacer.")) return;
    await api.delete(`/api/bills/${id}`);
    loadAll();
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Cuentas del Hogar</h1>
        <p className="text-sm text-muted">Luz, agua, internet y otras cuentas recurrentes.</p>
      </header>

      <form onSubmit={addBill} className="card p-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. Electricidad)"
            className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Proveedor (opcional)"
            className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
        </div>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto"
            inputMode="numeric"
            className="w-28 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Bill["frequency"])}
            className="rounded-xl border px-3 py-2 text-sm bg-transparent"
          >
            {(Object.keys(FREQUENCY_LABEL) as Bill["frequency"][]).map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        <button className="w-full rounded-xl bg-primary text-white py-2.5 text-sm font-semibold">
          Agregar cuenta
        </button>
      </form>

      {loading && <p className="text-sm text-muted">Cargando…</p>}

      {!loading && (
        <div className="card divide-y">
          {bills.length === 0 && <p className="text-sm text-muted p-4">No hay cuentas registradas todavía.</p>}
          {bills.map((b) => (
            <div key={b.id} className="px-4 py-3 flex items-center gap-3">
              <span className={`priority-dot ${STATUS_DOT[b.status]} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {b.name}
                  {b.provider ? ` · ${b.provider}` : ""}
                </p>
                <p className="text-xs text-muted">
                  {money(Number(b.amount))} · vence {b.due_date} · {STATUS_LABEL[b.status]} ·{" "}
                  {FREQUENCY_LABEL[b.frequency]}
                </p>
              </div>
              {b.status !== "paid" && (
                <button
                  onClick={() => markPaid(b.id)}
                  className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-primary text-white font-medium"
                >
                  Marcar pagada
                </button>
              )}
              <button
                onClick={() => removeBill(b.id)}
                title="Eliminar"
                aria-label="Eliminar"
                className="shrink-0 text-xs px-2 py-1.5 text-priority-red"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
