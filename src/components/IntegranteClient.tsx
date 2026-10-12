"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { FamilyEvent, Task } from "@/types/domain";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IntegranteClient({ memberId }: { memberId: string }) {
  const { members } = useSession();
  const member = members.find((m) => m.id === memberId);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + 7);
      const [tasksRes, eventsRes] = await Promise.all([
        api.get<{ tasks: Task[] }>(`/api/tasks?assignedTo=${memberId}&status=pending`),
        api.get<{ events: FamilyEvent[] }>(
          `/api/events?memberId=${memberId}&from=${from.toISOString()}&to=${to.toISOString()}`
        ),
      ]);
      setTasks(tasksRes.tasks);
      setEvents(eventsRes.events);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (memberId && member) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, member]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post("/api/tasks", { title: title.trim(), dueDate: date || null, assigneeIds: [memberId] });
    setTitle("");
    setDate("");
    load();
  }

  async function toggleTask(task: Task) {
    await api.patch(`/api/tasks/${task.id}`, { status: task.status === "completed" ? "pending" : "completed" });
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdueOrUrgent = tasks.filter((t) => t.priority === "red" || (t.due_date && t.due_date < today));

  if (!member) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">No encontramos a este integrante de la familia.</p>
        <Link href="/" className="text-sm text-primary font-medium">
          ← Volver a Hoy
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: (member?.color ?? "#6366f1") + "33" }}
        >
          {member?.avatar_emoji ?? "🙂"}
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {greetingForHour(new Date().getHours())}, {member?.name ?? "..."}
          </h1>
          <p className="text-sm text-muted capitalize">
            {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : loadError ? (
        <div className="card p-4 space-y-2">
          <p className="text-sm text-priority-red">{loadError}</p>
          <button onClick={() => load()} className="text-sm text-primary font-medium">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">PRIORIDADES</h2>
            <div className="card p-3 space-y-1">
              {overdueOrUrgent.length === 0 && (
                <p className="text-sm text-muted py-2 px-1">Nada urgente. ¡Buen día!</p>
              )}
              {overdueOrUrgent.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 px-1 py-2">
                  <span className={`priority-dot ${t.priority}`} />
                  <span className="text-sm">{t.title}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">TAREAS PENDIENTES</h2>
            <div className="card divide-y">
              {tasks.length === 0 && <p className="text-sm text-muted p-4">No hay tareas pendientes.</p>}
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={t.status === "completed"}
                    onChange={() => toggleTask(t)}
                    className="h-4 w-4"
                  />
                  <span className={`priority-dot ${t.priority}`} />
                  <p className="flex-1 text-sm">{t.title}</p>
                  {t.due_date && <span className="text-xs text-muted">{t.due_date}</span>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">PRÓXIMAMENTE</h2>
            <div className="card divide-y">
              {events.length === 0 && <p className="text-sm text-muted p-4">No hay eventos próximos.</p>}
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">{e.title}</span>
                  <span className="text-xs text-muted capitalize">{formatEventTime(e.start_at)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">RESUMEN</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="card p-3">
                <p className="text-xl font-bold">{tasks.length}</p>
                <p className="text-xs text-muted">Tareas pendientes</p>
              </div>
              <div className="card p-3">
                <p className="text-xl font-bold">{events.length}</p>
                <p className="text-xs text-muted">Próximos eventos</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">AGREGAR TAREA</h2>
            <form onSubmit={addTask} className="card p-4 space-y-2">
              <div className="flex gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Nueva tarea para ${member?.name ?? ""}…`}
                  className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm bg-transparent"
                />
              </div>
              <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Agregar</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
