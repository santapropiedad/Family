import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { Recurrence, Reminder, Source } from "@/types/domain";

export interface ReminderFilters {
  status?: Reminder["status"];
  before?: string;
}

export async function listReminders(familyId: string, filters: ReminderFilters = {}): Promise<Reminder[]> {
  const db = await getDb();
  const conditions = ["family_id = $1"];
  const values: unknown[] = [familyId];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.before) {
    values.push(filters.before);
    conditions.push(`remind_at <= $${values.length}`);
  }
  const result = await db.query<Reminder>(
    `SELECT * FROM reminders WHERE ${conditions.join(" AND ")} ORDER BY remind_at ASC`,
    values
  );
  return result.rows;
}

export async function getReminder(familyId: string, reminderId: string): Promise<Reminder> {
  const db = await getDb();
  const result = await db.query<Reminder>("SELECT * FROM reminders WHERE family_id = $1 AND id = $2", [
    familyId,
    reminderId,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Recordatorio no encontrado.");
  return result.rows[0];
}

export interface CreateReminderInput {
  title: string;
  remindAt: string;
  recurrence?: Recurrence;
  relatedTaskId?: string | null;
  relatedEventId?: string | null;
  relatedBillId?: string | null;
  relatedMaintenanceId?: string | null;
  source?: Source;
  createdBy?: string | null;
}

export async function createReminder(familyId: string, input: CreateReminderInput): Promise<Reminder> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<Reminder>(
    `INSERT INTO reminders
       (id, family_id, title, remind_at, recurrence, related_task_id, related_event_id, related_bill_id, related_maintenance_id, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      id,
      familyId,
      input.title.trim(),
      input.remindAt,
      input.recurrence ?? "none",
      input.relatedTaskId ?? null,
      input.relatedEventId ?? null,
      input.relatedBillId ?? null,
      input.relatedMaintenanceId ?? null,
      input.source ?? "manual",
      input.createdBy ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateReminder(
  familyId: string,
  reminderId: string,
  patch: Partial<Pick<Reminder, "title" | "remind_at" | "recurrence" | "status">>
): Promise<Reminder> {
  await getReminder(familyId, reminderId);
  const db = await getDb();
  const fields = (Object.keys(patch) as Array<keyof typeof patch>).filter((f) => patch[f] !== undefined);
  if (fields.length === 0) return getReminder(familyId, reminderId);
  const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
  const values = fields.map((field) => patch[field]);
  const result = await db.query<Reminder>(
    `UPDATE reminders SET ${setClauses.join(", ")}, updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, reminderId, ...values]
  );
  return result.rows[0];
}

export async function deleteReminder(familyId: string, reminderId: string): Promise<void> {
  await getReminder(familyId, reminderId);
  const db = await getDb();
  await db.query("DELETE FROM reminders WHERE family_id = $1 AND id = $2", [familyId, reminderId]);
}
