import { listTasks } from "@/services/tasks";
import { createNotification } from "@/services/notifications";
import { alarmPhaseFor, combineDueAt } from "@/lib/taskTime";
import type { Notification } from "@/types/domain";

/**
 * Revisa las tareas pendientes de la familia y crea los avisos que correspondan:
 * 15 minutos antes del vencimiento, y 10 minutos después si sigue sin completarse.
 * `createNotification` ya evita duplicados del mismo tipo+tarea dentro de 20 horas,
 * así que llamar esto repetidamente (polling) es seguro.
 */
export async function checkTaskAlarms(familyId: string, now: Date = new Date()): Promise<Notification[]> {
  const pending = await listTasks(familyId, { status: "pending" });
  const created: Notification[] = [];

  for (const task of pending) {
    if (!task.due_date || !task.due_time) continue;
    const dueAt = combineDueAt(task.due_date, task.due_time);
    const phase = alarmPhaseFor(dueAt, now);
    if (!phase) continue;

    const assignees = task.assignees ?? [];
    // Si hay un único responsable, el aviso es solo para esa persona; si hay varios o
    // ninguno, el aviso es para toda la familia (así lo ve quien tenga la app abierta).
    const familyMemberId = assignees.length === 1 ? assignees[0] : null;
    const time = task.due_time.slice(0, 5);

    const notification = await createNotification(familyId, {
      familyMemberId,
      type: phase === "due_soon" ? "task_due_soon" : "task_overdue_alarm",
      title:
        phase === "due_soon"
          ? `"${task.title}" vence pronto`
          : `"${task.title}" venció y sigue sin completarse`,
      body:
        phase === "due_soon"
          ? `Vence a las ${time}. Puedes completarla o postergarla.`
          : `Debía estar lista a las ${time}.`,
      priority: phase === "due_soon" ? "medium" : "high",
      relatedEntityType: "task",
      relatedEntityId: task.id,
    });
    if (notification) created.push(notification);
  }

  return created;
}
