import { getDb } from "@/db/client";
import { listBills } from "@/services/bills";
import { listTasks } from "@/services/tasks";
import { listEvents } from "@/services/events";
import { suggestLowStockItems } from "@/services/shopping";
import { summarizeByCategory, totalForPeriod } from "@/services/expenses";
import { getFamily } from "@/services/families";
import { listMembers } from "@/services/members";

export type InsightKind =
  | "bill_due_soon"
  | "habitual_purchase"
  | "overdue_task"
  | "schedule_conflict"
  | "unusual_spending";

export interface Insight {
  kind: InsightKind;
  priority: "red" | "yellow" | "green";
  title: string;
  detail: string;
  entityId?: string;
}

function startOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function endOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function assignedToMember(assignees: string[] | undefined, visibleIds: string[] | undefined): boolean {
  return !visibleIds || !assignees || assignees.length === 0 || assignees.some((id) => visibleIds.includes(id));
}

/**
 * Los hijos no tienen acceso propio a la app (son menores), así que lo que ven Juan/Teany en
 * "Hoy" debe incluir también lo que está asignado a cualquier hijo, no solo lo propio — si no,
 * nadie vería las tareas de los chicos. Un niño (si algún día inicia sesión) solo ve lo suyo.
 */
async function resolveVisibleMemberIds(familyId: string, memberId?: string): Promise<string[] | undefined> {
  if (!memberId) return undefined;
  const members = await listMembers(familyId);
  const viewer = members.find((m) => m.id === memberId);
  if (viewer && (viewer.role === "admin" || viewer.role === "adult")) {
    const childIds = members.filter((m) => m.role === "child").map((m) => m.id);
    return [memberId, ...childIds];
  }
  return [memberId];
}

/** Motor de inteligencia proactiva: detecta situaciones útiles sin ejecutar ninguna acción por sí solo. */
export async function detectInsights(familyId: string, memberId?: string): Promise<Insight[]> {
  const family = await getFamily(familyId);
  const insights: Insight[] = [];
  if (!family.ai_proactive_enabled) return insights;
  const visibleIds = await resolveVisibleMemberIds(familyId, memberId);

  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const bills = await listBills(familyId, "pending");
  for (const bill of bills) {
    if (bill.due_date <= in3Days) {
      const isTomorrow =
        bill.due_date === new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      insights.push({
        kind: "bill_due_soon",
        priority: "red",
        title: `La cuenta de ${bill.name} ${isTomorrow ? "vence mañana" : `vence el ${bill.due_date}`}`,
        detail: `Monto: $${Number(bill.amount).toLocaleString("es-CL")}.`,
        entityId: bill.id,
      });
    }
  }

  if (family.shopping_suggestions_enabled) {
    const lowStock = await suggestLowStockItems(familyId);
    for (const item of lowStock) {
      insights.push({
        kind: "habitual_purchase",
        priority: "yellow",
        title: `Probablemente necesitarás ${item.name} pronto`,
        detail: `Normalmente la compran cada ${Math.round(Number(item.avg_purchase_frequency_days))} días.`,
        entityId: item.id,
      });
    }
  }

  const pendingTasks = await listTasks(familyId, { status: "pending" });
  const today = now.toISOString().slice(0, 10);
  for (const task of pendingTasks) {
    if (!assignedToMember(task.assignees, visibleIds)) continue;
    if (task.due_date && task.due_date < today) {
      const daysLate = Math.round(
        (new Date(today).getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      insights.push({
        kind: "overdue_task",
        priority: "red",
        title: `La tarea "${task.title}" lleva ${daysLate} día${daysLate === 1 ? "" : "s"} atrasada`,
        detail: "Puedes reasignarla, cambiar su fecha o completarla.",
        entityId: task.id,
      });
    }
  }

  const upcomingEvents = await listEvents(familyId, {
    from: now.toISOString(),
    to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const seen = new Set<string>();
  for (const event of upcomingEvents) {
    for (const memberId of event.assignees ?? []) {
      const key = `${memberId}:${event.start_at}`;
      if (seen.has(key)) {
        insights.push({
          kind: "schedule_conflict",
          priority: "yellow",
          title: "Hay actividades que se cruzan en el horario",
          detail: `"${event.title}" se cruza con otra actividad para la misma persona.`,
          entityId: event.id,
        });
      }
      seen.add(key);
    }
  }

  const thisMonth = await summarizeByCategory(familyId, startOfMonth(now), endOfMonth(now));
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = await summarizeByCategory(familyId, startOfMonth(lastMonthDate), endOfMonth(lastMonthDate));
  for (const cat of thisMonth) {
    const prior = lastMonth.find((c) => c.categoryId === cat.categoryId);
    if (prior && prior.total > 0) {
      const change = (cat.total - prior.total) / prior.total;
      if (change >= 0.15) {
        insights.push({
          kind: "unusual_spending",
          priority: "yellow",
          title: `${cat.categoryName ?? "Una categoría"} aumentó ${Math.round(change * 100)}% este mes`,
          detail: `Vas en $${cat.total.toLocaleString("es-CL")}, el mes pasado fue $${prior.total.toLocaleString("es-CL")}.`,
          entityId: cat.categoryId ?? undefined,
        });
      }
    }
  }

  return insights;
}

export interface TodaySummary {
  greeting: string;
  priorities: Array<{
    id: string;
    title: string;
    priority: "red" | "yellow" | "green";
    kind: string;
    daysLate?: number;
  }>;
  pendingTasksCount: number;
  completedTasksCount: number;
  pendingShoppingCount: number;
  expensesThisMonth: number;
  upcomingEventsCount: number;
  insights: Insight[];
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export async function buildTodaySummary(familyId: string, memberId?: string): Promise<TodaySummary> {
  const now = new Date();
  const [allTasks, allEvents, allCompletedTasks, insights, visibleIds] = await Promise.all([
    listTasks(familyId, { status: "pending" }),
    listEvents(familyId, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }),
    listTasks(familyId, { status: "completed" }),
    detectInsights(familyId, memberId),
    resolveVisibleMemberIds(familyId, memberId),
  ]);

  const tasks = allTasks.filter((t) => assignedToMember(t.assignees, visibleIds));
  const events = allEvents.filter((e) => assignedToMember(e.assignees, visibleIds));
  const completedTasks = allCompletedTasks.filter((t) => assignedToMember(t.assignees, visibleIds));

  const db = await getDb();
  const shoppingCount = await db.query<{ count: string }>(
    "SELECT count(*) FROM shopping_items WHERE family_id = $1 AND status = 'pending'",
    [familyId]
  );
  const monthTotal = await totalForPeriod(familyId, startOfMonth(now), endOfMonth(now));
  const completedToday = completedTasks.filter(
    (t) => t.completed_at && t.completed_at.slice(0, 10) === now.toISOString().slice(0, 10)
  ).length;

  // Las tareas atrasadas ya generan su propio insight "overdue_task" (texto tipo "lleva X días
  // atrasada"); si además se incluyen tal cual en la lista de tareas de abajo, la misma tarea
  // termina apareciendo dos veces en Prioridades. En vez de eso, acá se calculan los días de
  // atraso directo sobre la tarea y se muestran en una sola línea junto a su título.
  const todayStr = now.toISOString().slice(0, 10);
  function daysLateFor(dueDate: string | null): number | undefined {
    if (!dueDate || dueDate >= todayStr) return undefined;
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date(`${todayStr}T00:00:00`);
    return Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  }
  const tasksByUrgency = [...tasks].sort((a, b) => (daysLateFor(b.due_date) ?? -1) - (daysLateFor(a.due_date) ?? -1));

  const priorities = [
    ...insights
      .filter((i) => i.priority === "red" && i.kind !== "overdue_task")
      .map((i) => ({ id: i.entityId ?? i.kind, title: i.title, priority: i.priority, kind: i.kind })),
    ...tasksByUrgency.slice(0, 6).map((t) => {
      const daysLate = daysLateFor(t.due_date);
      return { id: t.id, title: t.title, priority: daysLate ? "red" as const : t.priority, kind: "task", daysLate };
    }),
  ].slice(0, 6);

  return {
    greeting: greetingForHour(now.getHours()),
    priorities,
    pendingTasksCount: tasks.length,
    completedTasksCount: completedToday,
    pendingShoppingCount: Number(shoppingCount.rows[0]?.count ?? 0),
    expensesThisMonth: monthTotal,
    upcomingEventsCount: events.length,
    insights,
  };
}

/** Resumen "Buenos días" / "Resumen nocturno" en texto, listo para mostrarse o leerse en voz alta. */
export async function buildSpokenSummary(familyId: string, mode: "morning" | "night"): Promise<string> {
  const summary = await buildTodaySummary(familyId);
  if (mode === "morning") {
    const parts = [`${summary.greeting}.`];
    if (summary.pendingTasksCount > 0) {
      parts.push(
        `Hoy tienes ${summary.pendingTasksCount} tarea${summary.pendingTasksCount === 1 ? "" : "s"} pendiente${summary.pendingTasksCount === 1 ? "" : "s"}.`
      );
    }
    const redInsight = summary.insights.find((i) => i.priority === "red");
    if (redInsight) parts.push(redInsight.title + ".");
    if (summary.pendingShoppingCount > 0) {
      parts.push(`Hay ${summary.pendingShoppingCount} producto${summary.pendingShoppingCount === 1 ? "" : "s"} pendientes de compra.`);
    }
    if (summary.upcomingEventsCount > 0) {
      parts.push(`Tienes ${summary.upcomingEventsCount} actividad${summary.upcomingEventsCount === 1 ? "" : "es"} en las próximas 24 horas.`);
    }
    return parts.join(" ");
  }

  const completed = summary.completedTasksCount;
  const total = completed + summary.pendingTasksCount;
  const parts = [`Terminaste ${completed} de ${total} tareas hoy.`];
  if (summary.pendingTasksCount > 0) {
    parts.push(`Quedan pendientes algunas tareas para mañana.`);
  } else {
    parts.push("¡Completaste todo lo de hoy!");
  }
  return parts.join(" ");
}
