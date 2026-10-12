import { getDb } from "@/db/client";
import { listTasks } from "@/services/tasks";
import { createNotification } from "@/services/notifications";
import { sendPushForNotification } from "@/services/push";
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

/** IDs de familias con al menos una tarea pendiente que tiene fecha Y hora de vencimiento. */
export async function listFamilyIdsWithTimedPendingTasks(): Promise<string[]> {
  const db = await getDb();
  const result = await db.query<{ family_id: string }>(
    `SELECT DISTINCT family_id FROM tasks WHERE status = 'pending' AND due_date IS NOT NULL AND due_time IS NOT NULL`
  );
  return result.rows.map((r) => r.family_id);
}

/**
 * Igual que `checkTaskAlarms`, pero además envía un push (Web Push) por cada aviso nuevo —
 * para cuando nadie tiene la app abierta para hacer polling. Pensado para ser llamado desde
 * un cron externo (ver /api/cron/check-alarms), no desde el polling del cliente (ese usa
 * `checkTaskAlarms` directo, para no duplicar el aviso push + el toast en pantalla).
 */
export async function checkAndPushTaskAlarms(familyId: string, now: Date = new Date()): Promise<Notification[]> {
  const created = await checkTaskAlarms(familyId, now);
  await Promise.all(
    created.map((n) =>
      sendPushForNotification(familyId, n.family_member_id, { title: n.title, body: n.body, tag: n.type })
    )
  );
  return created;
}

/** Revisa y avisa (con push) las alarmas de TODAS las familias con tareas pendientes a tiempo. */
export async function checkAllFamiliesTaskAlarms(now: Date = new Date()): Promise<number> {
  const familyIds = await listFamilyIdsWithTimedPendingTasks();
  let total = 0;
  for (const familyId of familyIds) {
    const created = await checkAndPushTaskAlarms(familyId, now);
    total += created.length;
  }
  return total;
}
