"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { Task } from "@/types/domain";

export default function CasaPage() {
  const { members } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const t = await api.get<{ tasks: Task[] }>("/api/tasks");
    setTasks(t.tasks);
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
    </div>
  );
}
