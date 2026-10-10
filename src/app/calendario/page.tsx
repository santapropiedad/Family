"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { EventCategory, FamilyEvent } from "@/types/domain";

const CATEGORY_LABEL: Record<EventCategory, string> = {
  birthday: "🎂 Cumpleaños",
  school: "🏫 Colegio",
  appointment: "📋 Cita",
  activity: "⚽ Actividad",
  vacation: "🏖️ Vacaciones",
  payment: "💳 Pago",
  maintenance: "🛠️ Mantención",
  family: "👨‍👩‍👧‍👦 Familiar",
  other: "📌 Otro",
};

export default function CalendarioPage() {
  const { members } = useSession();
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setMonth(to.getMonth() + 2);
    const res = await api.get<{ events: FamilyEvent[] }>(
      `/api/events?from=${from.toISOString()}&to=${to.toISOString()}`
    );
    setEvents(res.events);
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    await api.post("/api/events", { title: title.trim(), startAt: `${date}T${time}:00` });
    setTitle("");
    setDate("");
    loadEvents();
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const upcoming = events.filter((e) => new Date(e.start_at) >= new Date(new Date().toDateString()));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Calendario Familiar</h1>
        <p className="text-sm text-muted">Agenda compartida de toda la familia.</p>
      </header>

      <form onSubmit={addEvent} className="card p-4 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del evento"
          className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-28 rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
        </div>
        <button className="w-full rounded-xl bg-primary text-white py-2.5 text-sm font-semibold">
          Agregar evento
        </button>
      </form>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">PRÓXIMOS</h2>
        <div className="card divide-y">
          {loading && <p className="text-sm text-muted p-4">Cargando…</p>}
          {!loading && upcoming.length === 0 && <p className="text-sm text-muted p-4">No hay eventos próximos.</p>}
          {upcoming.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex justify-between">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted">
                  {new Date(e.start_at).toLocaleString("es-CL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <p className="text-xs text-muted">
                {CATEGORY_LABEL[e.category]}
                {(e.assignees?.length ?? 0) > 0 && ` · ${e.assignees!.map(memberName).join(", ")}`}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
