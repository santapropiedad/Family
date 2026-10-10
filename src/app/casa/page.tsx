"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { Bill, Maintenance, Task } from "@/types/domain";

type Tab = "tareas" | "mantenciones" | "cuentas";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export default function CasaPage() {
  const [tab, setTab] = useState<Tab>("tareas");
  const { members } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [t, m, b] = await Promise.all([
      api.get<{ tasks: Task[] }>("/api/tasks"),
      api.get<{ items: Maintenance[] }>("/api/maintenance"),
      api.get<{ bills: Bill[] }>("/api/bills"),
    ]);
    setTasks(t.tasks);
    setMaintenance(m.items);
    setBills(b.bills);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await api.post("/api/tasks", { title: newTitle.trim() });
    setNewTitle("");
    loadAll();
  }

  async function toggleTask(task: Task) {
    await api.patch(`/api/tasks/${task.id}`, { status: task.status === "completed" ? "pending" : "completed" });
    loadAll();
  }

  async function completeMaintenanceItem(id: string) {
    await api.post(`/api/maintenance/${id}/complete`);
    loadAll();
  }

  async function payBill(id: string) {
    if (!confirm("¿Confirmas que quieres marcar esta cuenta como pagada?")) return;
    await api.post(`/api/bills/${id}/pay`);
    loadAll();
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Casa en Orden</h1>
        <p className="text-sm text-muted">Tareas, mantenciones y cuentas del hogar.</p>
      </header>

      <div className="flex gap-2">
        {([
          ["tareas", "Tareas"],
          ["mantenciones", "Mantenciones"],
          ["cuentas", "Cuentas"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              tab === key ? "bg-primary text-white" : "bg-border/60 text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted">Cargando…</p>}

      {!loading && tab === "tareas" && (
        <div className="space-y-3">
          <form onSubmit={addTask} className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Nueva tarea…"
              className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
            <button className="rounded-xl bg-primary text-white px-4 text-sm font-medium">Agregar</button>
          </form>
          <div className="card divide-y">
            {tasks.length === 0 && <p className="text-sm text-muted p-4">No hay tareas todavía.</p>}
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={t.status === "completed"}
                  onChange={() => toggleTask(t)}
                  className="h-4 w-4"
                />
                <span className={`priority-dot ${t.priority}`} />
                <div className="flex-1">
                  <p className={`text-sm ${t.status === "completed" ? "line-through text-muted" : ""}`}>{t.title}</p>
                  {(t.assignees?.length ?? 0) > 0 && (
                    <p className="text-xs text-muted">{t.assignees!.map(memberName).join(", ")}</p>
                  )}
                </div>
                {t.due_date && <span className="text-xs text-muted">{t.due_date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "mantenciones" && (
        <div className="card divide-y">
          {maintenance.length === 0 && <p className="text-sm text-muted p-4">No hay equipos registrados.</p>}
          {maintenance.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted">
                  {m.next_maintenance_at
                    ? `Próxima: ${m.next_maintenance_at}`
                    : "Sin próxima mantención programada"}
                </p>
              </div>
              <button
                onClick={() => completeMaintenanceItem(m.id)}
                className="text-xs font-medium text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
              >
                Marcar hecha
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "cuentas" && (
        <div className="card divide-y">
          {bills.length === 0 && <p className="text-sm text-muted p-4">No hay cuentas registradas.</p>}
          {bills.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{b.name}</p>
                <p className="text-xs text-muted">
                  Vence {b.due_date} · {money(Number(b.amount))}
                </p>
              </div>
              {b.status === "pending" || b.status === "overdue" ? (
                <button
                  onClick={() => payBill(b.id)}
                  className="text-xs font-medium text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
                >
                  Pagar
                </button>
              ) : (
                <span className="text-xs text-priority-green">Pagada</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
