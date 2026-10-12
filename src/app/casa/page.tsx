"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import { postponeDue } from "@/lib/taskTime";
import type { Task } from "@/types/domain";

export default function CasaPage() {
  const { session, members } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [postponeFor, setPostponeFor] = useState<string | null>(null);

  const canAssignOthers = session?.role === "admin" || session?.role === "adult";

  async function loadAll() {
    const t = await api.get<{ tasks: Task[] }>("/api/tasks");
    setTasks(t.tasks);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await api.post("/api/tasks", {
      title: newTitle.trim(),
      dueDate: newDate || undefined,
      dueTime: newTime || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
    });
    setNewTitle("");
    setNewDate("");
    setNewTime("");
    setAssigneeIds([]);
    loadAll();
  }

  async function toggleTask(task: Task) {
    await api.patch(`/api/tasks/${task.id}`, { status: task.status === "completed" ? "pending" : "completed" });
    loadAll();
  }

  async function postpone(task: Task, minutes: number) {
    const { dueDate, dueTime } = postponeDue(task, minutes);
    await api.patch(`/api/tasks/${task.id}`, { dueDate, dueTime });
    setPostponeFor(null);
    loadAll();
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Casa en Orden</h1>
        <p className="text-sm text-muted">Tareas del hogar.</p>
      </header>

      {loading && <p className="text-sm text-muted">Cargando…</p>}

      {!loading && (
        <div className="space-y-3">
          <form onSubmit={addTask} className="card p-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Nueva tarea…"
                className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
              <button className="rounded-xl bg-primary text-white px-4 text-sm font-medium">Agregar</button>
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                title="Hora de vencimiento (para avisos 15 min antes y 10 min después)"
                className="rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
            </div>
            {canAssignOthers && (
              <div className="flex gap-1.5 flex-wrap">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAssignee(m.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      assigneeIds.includes(m.id) ? "bg-primary text-white" : "bg-border/60 text-muted"
                    }`}
                  >
                    {m.avatar_emoji ?? "🙂"} {m.name}
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="card divide-y">
            {tasks.length === 0 && <p className="text-sm text-muted p-4">No hay tareas todavía.</p>}
            {tasks.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
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
                  {t.due_date && (
                    <span className="text-xs text-muted shrink-0">
                      {t.due_date}
                      {t.due_time && ` ${t.due_time.slice(0, 5)}`}
                    </span>
                  )}
                  {t.status === "pending" && (
                    <button
                      onClick={() => setPostponeFor(postponeFor === t.id ? null : t.id)}
                      className="text-xs text-muted shrink-0"
                      title="Postergar"
                    >
                      ⏰
                    </button>
                  )}
                </div>
                {postponeFor === t.id && (
                  <div className="flex gap-2 pt-2 pl-7">
                    <button onClick={() => postpone(t, 15)} className="text-xs px-2 py-1 rounded-lg bg-border/60">
                      +15 min
                    </button>
                    <button onClick={() => postpone(t, 60)} className="text-xs px-2 py-1 rounded-lg bg-border/60">
                      +1 hora
                    </button>
                    <button onClick={() => postpone(t, 60 * 24)} className="text-xs px-2 py-1 rounded-lg bg-border/60">
                      +1 día
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
