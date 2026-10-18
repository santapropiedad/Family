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

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CATEGORY_DOT: Record<EventCategory, string> = {
  birthday: "bg-pink-400",
  school: "bg-blue-400",
  appointment: "bg-amber-400",
  activity: "bg-green-400",
  vacation: "bg-teal-400",
  payment: "bg-red-400",
  maintenance: "bg-gray-400",
  family: "bg-purple-400",
  other: "bg-muted",
};

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Lunes a domingo (6 filas x 7 columnas) que cubren el mes, incluyendo los días de relleno de los meses vecinos. */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = lunes
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarioPage() {
  const { members } = useSession();
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"lista" | "mes">("lista");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  async function loadEvents(monthAnchor: Date) {
    const from = new Date(monthAnchor);
    from.setMonth(from.getMonth() - 1);
    const to = new Date(monthAnchor);
    to.setMonth(to.getMonth() + 2);
    const res = await api.get<{ events: FamilyEvent[] }>(
      `/api/events?from=${from.toISOString()}&to=${to.toISOString()}`
    );
    setEvents(res.events);
    setLoading(false);
  }

  useEffect(() => {
    loadEvents(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  function changeMonth(delta: number) {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
    setSelectedDay(null);
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    await api.post("/api/events", { title: title.trim(), startAt: `${date}T${time}:00` });
    setTitle("");
    setDate("");
    loadEvents(currentMonth);
  }

  function startEditEvent(e: FamilyEvent) {
    const d = new Date(e.start_at);
    setEditingEventId(e.id);
    setEditTitle(e.title);
    setEditDate(toDateInput(d));
    setEditTime(toTimeInput(d));
  }

  async function saveEditEvent(id: string) {
    if (!editTitle.trim() || !editDate) return;
    await api.patch(`/api/events/${id}`, { title: editTitle.trim(), startAt: `${editDate}T${editTime}:00` });
    setEditingEventId(null);
    loadEvents(currentMonth);
  }

  async function rescheduleEvent(e: FamilyEvent, days: number) {
    const next = new Date(e.start_at);
    next.setDate(next.getDate() + days);
    await api.patch(`/api/events/${e.id}`, { startAt: next.toISOString() });
    loadEvents(currentMonth);
  }

  async function removeEvent(id: string) {
    if (!confirm("¿Eliminar este evento?")) return;
    await api.delete(`/api/events/${id}`);
    setEditingEventId(null);
    loadEvents(currentMonth);
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const upcoming = events.filter((e) => new Date(e.start_at) >= new Date(new Date().toDateString()));
  const monthGrid = buildMonthGrid(currentMonth);
  const eventsForDay = (day: Date) => events.filter((e) => sameDay(new Date(e.start_at), day));
  const today = new Date();

  function renderEventRow(e: FamilyEvent, showFullDate: boolean) {
    if (editingEventId === e.id) {
      return (
        <div key={e.id} className="px-4 py-3 space-y-2">
          <input
            value={editTitle}
            onChange={(ev) => setEditTitle(ev.target.value)}
            placeholder="Título"
            className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={editDate}
              onChange={(ev) => setEditDate(ev.target.value)}
              className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
            <input
              type="time"
              value={editTime}
              onChange={(ev) => setEditTime(ev.target.value)}
              className="w-28 rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => saveEditEvent(e.id)}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white font-medium"
            >
              Guardar
            </button>
            <button onClick={() => setEditingEventId(null)} className="text-xs px-3 py-1.5 text-muted">
              Cancelar
            </button>
            <button onClick={() => removeEvent(e.id)} className="text-xs px-3 py-1.5 text-priority-red ml-auto">
              Eliminar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div key={e.id} className="px-4 py-3">
        <div className="flex justify-between items-start gap-2">
          <p className="text-sm font-medium min-w-0 truncate">{e.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-xs text-muted">
              {showFullDate
                ? new Date(e.start_at).toLocaleString("es-CL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date(e.start_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <button onClick={() => startEditEvent(e)} className="text-muted" title="Editar" aria-label="Editar">
              ✎
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-muted">
            {CATEGORY_LABEL[e.category]}
            {(e.assignees?.length ?? 0) > 0 && ` · ${e.assignees!.map(memberName).join(", ")}`}
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => rescheduleEvent(e, 1)} className="text-[11px] text-muted" title="Reagendar +1 día">
              +1 día
            </button>
            <button
              onClick={() => rescheduleEvent(e, 7)}
              className="text-[11px] text-muted"
              title="Reagendar +1 semana"
            >
              +1 sem.
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3 pr-14 sm:pr-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendario Familiar</h1>
          <p className="text-sm text-muted">Agenda compartida de toda la familia.</p>
        </div>
        <div className="flex gap-1 w-fit shrink-0 bg-border/60 rounded-xl p-1">
          <button
            onClick={() => setView("lista")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${view === "lista" ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            Lista
          </button>
          <button
            onClick={() => setView("mes")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${view === "mes" ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            Mes
          </button>
        </div>
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

      {view === "mes" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="text-lg px-3 py-1 rounded-lg hover:bg-border/60">
              ‹
            </button>
            <p className="text-sm font-semibold capitalize">
              {currentMonth.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
            </p>
            <button onClick={() => changeMonth(1)} className="text-lg px-3 py-1 rounded-lg hover:bg-border/60">
              ›
            </button>
          </div>

          <div className="card p-2">
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-[10px] font-medium text-muted py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.map((day) => {
                const inMonth = day.getMonth() === currentMonth.getMonth();
                const dayEvents = eventsForDay(day);
                const isToday = sameDay(day, today);
                const isSelected = selectedDay && sameDay(day, selectedDay);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`aspect-square rounded-lg p-1 text-left flex flex-col gap-0.5 ${
                      isSelected ? "bg-primary/15 ring-1 ring-primary" : isToday ? "bg-border/60" : ""
                    } ${inMonth ? "" : "opacity-35"}`}
                  >
                    <span className={`text-[11px] ${isToday ? "font-bold text-primary" : ""}`}>{day.getDate()}</span>
                    <div className="flex flex-wrap gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[e.category]}`} />
                      ))}
                      {dayEvents.length > 3 && <span className="text-[8px] text-muted">+{dayEvents.length - 3}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDay && (
            <div className="card divide-y">
              <p className="text-xs font-semibold text-muted px-4 py-2 capitalize">
                {selectedDay.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              {eventsForDay(selectedDay).length === 0 && (
                <p className="text-sm text-muted p-4">Sin eventos este día.</p>
              )}
              {eventsForDay(selectedDay).map((e) => renderEventRow(e, false))}
            </div>
          )}
        </section>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-muted mb-2">PRÓXIMOS</h2>
          <div className="card divide-y">
            {loading && <p className="text-sm text-muted p-4">Cargando…</p>}
            {!loading && upcoming.length === 0 && <p className="text-sm text-muted p-4">No hay eventos próximos.</p>}
            {upcoming.map((e) => renderEventRow(e, true))}
          </div>
        </section>
      )}
    </div>
  );
}
