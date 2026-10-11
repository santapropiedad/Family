"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { EventCategory, FamilyEvent, Task } from "@/types/domain";

type EntryType = "cumpleanos" | "prueba" | "trabajo" | "presentacion" | "material" | "tarea";

const TYPE_CONFIG: Record<EntryType, { label: string; icon: string; kind: "event" | "task"; category?: EventCategory; prefix?: string }> = {
  cumpleanos: { label: "Cumpleaños", icon: "🎂", kind: "event", category: "birthday" },
  prueba: { label: "Prueba", icon: "📝", kind: "event", category: "school", prefix: "Prueba" },
  trabajo: { label: "Trabajo", icon: "📚", kind: "event", category: "school", prefix: "Trabajo" },
  presentacion: { label: "Presentación", icon: "🎤", kind: "event", category: "school", prefix: "Presentación" },
  material: { label: "Material", icon: "🎒", kind: "task" },
  tarea: { label: "Tarea", icon: "✅", kind: "task" },
};

interface Entry {
  id: string;
  kind: "event" | "task";
  type: EntryType | null;
  title: string;
  date: string | null;
  done: boolean;
}

export default function HijosClient() {
  const { members } = useSession();
  const searchParams = useSearchParams();
  const requestedChildId = searchParams.get("child");
  const children = useMemo(() => members.filter((m) => m.role === "child"), [members]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryType, setEntryType] = useState<EntryType>("tarea");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (children.length === 0) return;
    if (requestedChildId && children.some((c) => c.id === requestedChildId)) {
      setSelectedId(requestedChildId);
    } else if (!selectedId) {
      setSelectedId(children[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, requestedChildId]);

  async function load(childId: string) {
    setLoading(true);
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setMonth(to.getMonth() + 6);
    const [eventsRes, tasksRes] = await Promise.all([
      api.get<{ events: FamilyEvent[] }>(
        `/api/events?memberId=${childId}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
      api.get<{ tasks: Task[] }>(`/api/tasks?assignedTo=${childId}`),
    ]);

    const eventEntries: Entry[] = eventsRes.events.map((e) => ({
      id: e.id,
      kind: "event",
      type: e.category === "birthday" ? "cumpleanos" : null,
      title: e.title,
      date: e.start_at,
      done: false,
    }));
    const taskEntries: Entry[] = tasksRes.tasks.map((t) => ({
      id: t.id,
      kind: "task",
      type: null,
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
    if (selectedId) load(selectedId);
  }, [selectedId]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !title.trim()) return;
    const config = TYPE_CONFIG[entryType];
    const finalTitle = config.prefix ? `${config.prefix}: ${title.trim()}` : title.trim();

    if (config.kind === "event") {
      await api.post("/api/events", {
        title: finalTitle,
        category: config.category,
        startAt: date ? `${date}T09:00:00` : new Date().toISOString(),
        assigneeIds: [selectedId],
      });
    } else {
      await api.post("/api/tasks", {
        title: finalTitle,
        dueDate: date || null,
        assigneeIds: [selectedId],
      });
    }
    setTitle("");
    setDate("");
    load(selectedId);
  }

  async function toggleDone(entry: Entry) {
    if (entry.kind !== "task") return;
    await api.patch(`/api/tasks/${entry.id}`, { status: entry.done ? "pending" : "completed" });
    if (selectedId) load(selectedId);
  }

  async function removeEntry(entry: Entry) {
    if (entry.kind === "event") await api.delete(`/api/events/${entry.id}`);
    else await api.delete(`/api/tasks/${entry.id}`);
    if (selectedId) load(selectedId);
  }

  const selectedChild = children.find((c) => c.id === selectedId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Hijos</h1>
        <p className="text-sm text-muted">Calendario, pruebas, trabajos, presentaciones, materiales y tareas.</p>
      </header>

      {children.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted p-4">No hay integrantes con rol &quot;Niño&quot; en la familia todavía.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  selectedId === c.id ? "bg-primary text-white" : "bg-border/60 text-muted"
                }`}
              >
                {c.avatar_emoji ?? "🙂"} {c.name}
              </button>
            ))}
          </div>

          <form onSubmit={addEntry} className="card p-4 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as EntryType)}
                className="rounded-xl border px-3 py-2 text-sm bg-transparent"
              >
                {(Object.keys(TYPE_CONFIG) as EntryType[]).map((key) => (
                  <option key={key} value={key}>
                    {TYPE_CONFIG[key].icon} {TYPE_CONFIG[key].label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Título (ej. ${TYPE_CONFIG[entryType].label.toLowerCase()} de...)`}
                className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
              <button className="rounded-xl bg-primary text-white px-4 text-sm font-medium">Agregar</button>
            </div>
          </form>

          <section>
            <h2 className="text-sm font-semibold text-muted mb-2">
              {selectedChild ? `AGENDA DE ${selectedChild.name.toUpperCase()}` : "AGENDA"}
            </h2>
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
                      <span className="text-lg">{entry.type ? TYPE_CONFIG[entry.type].icon : "📅"}</span>
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
        </>
      )}
    </div>
  );
}
