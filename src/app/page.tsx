"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { FamilyEvent, Task } from "@/types/domain";

interface TodaySummary {
  greeting: string;
  priorities: Array<{ id: string; title: string; priority: "red" | "yellow" | "green"; kind: string }>;
  pendingTasksCount: number;
  completedTasksCount: number;
  pendingShoppingCount: number;
  expensesThisMonth: number;
  upcomingEventsCount: number;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type RangeView = "dia" | "semana" | "mes";

const RANGE_LABEL: Record<RangeView, string> = { dia: "HOY", semana: "ESTA SEMANA", mes: "ESTE MES" };

/** Límites [desde, hasta] del rango elegido, siempre partiendo de hoy. */
function rangeBounds(view: RangeView): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  if (view === "dia") {
    to.setHours(23, 59, 59, 999);
  } else if (view === "semana") {
    to.setDate(to.getDate() + 7);
    to.setHours(23, 59, 59, 999);
  } else {
    to.setMonth(to.getMonth() + 1, 0); // último día del mes actual
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

export default function HoyPage() {
  const { session, members } = useSession();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeView, setRangeView] = useState<RangeView>("dia");

  // Los hijos no tienen acceso propio (son menores), así que un admin/adulto ve también lo
  // asignado a cualquier hijo en su propio "Hoy" — si no, nadie vería las tareas de los chicos.
  const visibleMemberIds = (() => {
    if (!session) return null;
    if (session.role === "admin" || session.role === "adult") {
      return [session.familyMemberId, ...members.filter((m) => m.role === "child").map((m) => m.id)];
    }
    return [session.familyMemberId];
  })();

  function visibleToViewer(assignees: string[] | undefined): boolean {
    if (!assignees || assignees.length === 0) return true;
    return !visibleMemberIds || assignees.some((id) => visibleMemberIds.includes(id));
  }

  useEffect(() => {
    async function load() {
      const { from, to } = rangeBounds(rangeView);
      const [summaryRes, tasksRes, eventsRes] = await Promise.all([
        api.get<TodaySummary>("/api/today"),
        api.get<{ tasks: Task[] }>("/api/tasks?status=pending"),
        api.get<{ events: FamilyEvent[] }>(`/api/events?from=${from.toISOString()}&to=${to.toISOString()}`),
      ]);
      setSummary(summaryRes);
      setTasks(tasksRes.tasks);
      setEvents(eventsRes.events.filter((e) => visibleToViewer(e.assignees)));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, rangeView, members]);

  const { from: rangeFrom, to: rangeTo } = rangeBounds(rangeView);
  const tasksInRange = tasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_time ? `${t.due_date}T${t.due_time}` : `${t.due_date}T00:00:00`);
    if (due < rangeFrom || due > rangeTo) return false;
    return visibleToViewer(t.assignees);
  });

  if (loading || !summary) {
    return <p className="text-sm text-muted">Cargando tu día…</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">
          {summary.greeting}
          {session ? `, ${session.name}` : ""}
        </h1>
        <p className="text-sm text-muted capitalize">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">PRIORIDADES DE HOY</h2>
        <div className="card p-3 space-y-1">
          {summary.priorities.length === 0 && (
            <p className="text-sm text-muted py-2 px-1">No hay nada urgente. ¡Buen día!</p>
          )}
          {summary.priorities.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 px-1 py-2">
              <span className={`priority-dot ${p.priority}`} />
              <span className="text-sm">{p.title}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">FAMILIA</h2>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(members.length, 1)}, minmax(0, 1fr))` }}>
          {members.map((m) => {
            const memberTasks = tasks.filter((t) => t.assignees?.includes(m.id));
            const href = `/integrante/${m.id}`;
            return (
              <Link key={m.id} href={href} className="card p-1.5 sm:p-3 text-center">
                <div
                  className="w-7 h-7 sm:w-10 sm:h-10 mx-auto rounded-full flex items-center justify-center text-sm sm:text-lg mb-1"
                  style={{ backgroundColor: m.color + "33" }}
                >
                  {m.avatar_emoji ?? "🙂"}
                </div>
                <p className="text-[10px] sm:text-xs font-medium truncate">{m.name}</p>
                <p className="text-[9px] sm:text-[11px] text-muted truncate">
                  {memberTasks.length} tarea{memberTasks.length === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted">{RANGE_LABEL[rangeView]}</h2>
          <div className="flex gap-1 bg-border/60 rounded-xl p-1">
            {(["dia", "semana", "mes"] as RangeView[]).map((v) => (
              <button
                key={v}
                onClick={() => setRangeView(v)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium capitalize ${
                  rangeView === v ? "bg-surface shadow-sm" : "text-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {tasksInRange.length > 0 && (
          <div className="card p-3 space-y-1 mb-2">
            <p className="text-xs text-muted px-1 pb-1">Tareas</p>
            {tasksInRange.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-1 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`priority-dot ${t.priority} shrink-0`} />
                  <span className="text-sm truncate">{t.title}</span>
                </div>
                <span className="text-xs text-muted shrink-0">
                  {t.due_date}
                  {t.due_time && ` ${t.due_time.slice(0, 5)}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="card p-3 space-y-2">
          <p className="text-xs text-muted px-1 pb-1">Eventos</p>
          {events.length === 0 && <p className="text-sm text-muted py-2 px-1">No hay actividades en este período.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-1 py-1.5">
              <span className="text-sm">{e.title}</span>
              <span className="text-xs text-muted capitalize">{formatEventTime(e.start_at)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">RESUMEN</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/casa" className="card p-3">
            <p className="text-xl font-bold">{summary.pendingTasksCount}</p>
            <p className="text-xs text-muted">Tareas pendientes</p>
          </Link>
          <div className="card p-3">
            <p className="text-xl font-bold">{summary.completedTasksCount}</p>
            <p className="text-xs text-muted">Completadas hoy</p>
          </div>
          <div className="card p-3">
            <p className="text-xl font-bold">{summary.pendingShoppingCount}</p>
            <p className="text-xs text-muted">Compras pendientes</p>
          </div>
          <Link href="/gastos" className="card p-3">
            <p className="text-xl font-bold">{money(summary.expensesThisMonth)}</p>
            <p className="text-xs text-muted">Gastado este mes</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
