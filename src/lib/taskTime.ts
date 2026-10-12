/** Utilidades de fecha/hora para el sistema de avisos y postergación de tareas. */

export const DUE_SOON_MINUTES = 15;
export const OVERDUE_ALARM_MINUTES = 10;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Combina due_date ("YYYY-MM-DD") + due_time ("HH:MM" o "HH:MM:SS") en un Date local. */
export function combineDueAt(dueDate: string, dueTime: string): Date {
  const time = dueTime.length === 5 ? `${dueTime}:00` : dueTime;
  return new Date(`${dueDate}T${time}`);
}

export function toDateTimeParts(date: Date): { dueDate: string; dueTime: string } {
  return {
    dueDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    dueTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export type AlarmPhase = "due_soon" | "overdue_alarm" | null;

/** Determina si una tarea (con fecha+hora de vencimiento) debe avisar ahora mismo, y en qué fase. */
export function alarmPhaseFor(dueAt: Date, now: Date): AlarmPhase {
  const minutesUntilDue = (dueAt.getTime() - now.getTime()) / 60000;
  if (minutesUntilDue <= -OVERDUE_ALARM_MINUTES) return "overdue_alarm";
  if (minutesUntilDue <= DUE_SOON_MINUTES && minutesUntilDue >= 0) return "due_soon";
  return null;
}

/**
 * Calcula la nueva fecha/hora al "postergar" una tarea `minutes` minutos.
 * Parte del vencimiento actual si todavía no llega (tiene sentido correr la alarma),
 * o de "ahora" si ya venció (no tiene sentido postergar desde un vencimiento pasado).
 */
export function postponeDue(
  current: { due_date: string | null; due_time: string | null },
  minutes: number,
  now: Date = new Date()
): { dueDate: string; dueTime: string } {
  const currentDueAt =
    current.due_date && current.due_time ? combineDueAt(current.due_date, current.due_time) : null;
  const base = currentDueAt && currentDueAt.getTime() > now.getTime() ? currentDueAt : now;
  return toDateTimeParts(new Date(base.getTime() + minutes * 60000));
}
