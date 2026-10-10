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

export default function HoyPage() {
  const { session, members } = useSession();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [summaryRes, tasksRes, eventsRes] = await Promise.all([
        api.get<TodaySummary>("/api/today"),
        api.get<{ tasks: Task[] }>("/api/tasks?status=pending"),
        api.get<{ events: FamilyEvent[] }>(
          `/api/events?from=${new Date().toISOString()}&to=${new Date(Date.now() + 7 * 86400000).toISOString()}`
        ),
      ]);
      setSummary(summaryRes);
      setTasks(tasksRes.tasks);
      setEvents(eventsRes.events);
      setLoading(false);
    }
    load();
  }, []);

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
            return (
              <div key={m.id} className="card p-1.5 sm:p-3 text-center">
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
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">PRÓXIMAMENTE</h2>
        <div className="card p-3 space-y-2">
          {events.length === 0 && <p className="text-sm text-muted py-2 px-1">No hay actividades próximas.</p>}
          {events.slice(0, 5).map((e) => (
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
          <Link href="/compras" className="card p-3">
            <p className="text-xl font-bold">{summary.pendingShoppingCount}</p>
            <p className="text-xs text-muted">Compras pendientes</p>
          </Link>
          <Link href="/gastos" className="card p-3">
            <p className="text-xl font-bold">{money(summary.expensesThisMonth)}</p>
            <p className="text-xs text-muted">Gastado este mes</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
