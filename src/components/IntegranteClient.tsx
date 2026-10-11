"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { FamilyEvent, Task } from "@/types/domain";

interface Entry {
  id: string;
  kind: "event" | "task";
  title: string;
  date: string | null;
  done: boolean;
}

export default function IntegranteClient({ memberId }: { memberId: string }) {
  const { members } = useSession();
  const member = members.find((m) => m.id === memberId);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  async function load() {
    setLoading(true);
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setMonth(to.getMonth() + 3);
    const [eventsRes, tasksRes] = await Promise.all([
      api.get<{ events: FamilyEvent[] }>(
        `/api/events?memberId=${memberId}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
      api.get<{ tasks: Task[] }>(`/api/tasks?assignedTo=${memberId}`),
    ]);
    const eventEntries: Entry[] = eventsRes.events.map((e) => ({
      id: e.id,
      kind: "event",
      title: e.title,
      date: e.start_at,
      done: false,
    }));
    const taskEntries: Entry[] = tasksRes.tasks.map((t) => ({
      id: t.id,
      kind: "task",
      title: t.title,
      date: t.due_date,
      done: t.status === "completed",
    }));
    const merged = [...eventEntries, ...taskEntries].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    setEntries(merged);
    setLoading(false);
  }

  useEffect(() => {
    if (memberId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post("/api/tasks", { title: title.trim(), dueDate: date || null, assigneeIds: [memberId] });
    setTitle("");
    setDate("");
    load();
  }

  async function toggleDone(entry: Entry) {
    if (entry.kind !== "task") return;
    await api.patch(`/api/tasks/${entry.id}`, { status: entry.done ? "pending" : "completed" });
    load();
  }

  async function removeEntry(entry: Entry) {
    if (entry.kind === "event") await api.delete(`/api/events/${entry.id}`);
    else await api.delete(`/api/tasks/${entry.id}`);
    load();
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
          style={{ backgroundColor: (member?.color ?? "#6366f1") + "33" }}
        >
          {member?.avatar_emoji ?? "🙂"}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{member?.name ?? "Integrante"}</h1>
          <p className="text-sm text-muted">Tareas y agenda de {member?.name ?? "esta persona"}.</p>
        </div>
      </header>

      <form onSubmit={addTask} className="card p-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nueva tarea…"
            className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
        </div>
        <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Agregar tarea</button>
      </form>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">AGENDA</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        {!loading && entries.length === 0 && (
          <div className="card">
            <p className="text-sm text-muted p-4">No hay nada agendado todavía.</p>
          </div>
        )}
        {!loading && entries.length > 0 && (
          <div className="card divide-y">
            {entries.map((entry) => (
              <div key={`${entry.kind}-${entry.id}`} className="flex items-center gap-3 px-4 py-3">
                {entry.kind === "task" ? (
                  <input
                    type="checkbox"
                    checked={entry.done}
                    onChange={() => toggleDone(entry)}
                    className="h-4 w-4"
                  />
                ) : (
                  <span className="text-lg">📅</span>
                )}
                <div className="flex-1">
                  <p className={`text-sm ${entry.done ? "line-through text-muted" : ""}`}>{entry.title}</p>
                  <p className="text-xs text-muted">
                    {entry.date
                      ? new Date(entry.date).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
                      : "Sin fecha"}
                    {" · "}
                    {entry.kind === "event" ? "Calendario" : "Tarea"}
                  </p>
                </div>
                <button onClick={() => removeEntry(entry)} className="text-xs text-muted px-1">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
