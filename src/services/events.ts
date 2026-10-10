import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { EventCategory, FamilyEvent, Source } from "@/types/domain";

async function withAssignees(events: FamilyEvent[]): Promise<FamilyEvent[]> {
  if (events.length === 0) return events;
  const db = await getDb();
  const ids = events.map((e) => e.id);
  const result = await db.query<{ event_id: string; family_member_id: string }>(
    `SELECT event_id, family_member_id FROM event_assignments WHERE event_id = ANY($1::uuid[])`,
    [ids]
  );
  const byEvent = new Map<string, string[]>();
  for (const row of result.rows) {
    const list = byEvent.get(row.event_id) ?? [];
    list.push(row.family_member_id);
    byEvent.set(row.event_id, list);
  }
  return events.map((e) => ({ ...e, assignees: byEvent.get(e.id) ?? [] }));
}

export interface EventFilters {
  from?: string;
  to?: string;
  memberId?: string;
}

export async function listEvents(familyId: string, filters: EventFilters = {}): Promise<FamilyEvent[]> {
  const db = await getDb();
  const conditions = ["e.family_id = $1"];
  const values: unknown[] = [familyId];

  if (filters.from) {
    values.push(filters.from);
    conditions.push(`e.start_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`e.start_at <= $${values.length}`);
  }
  if (filters.memberId) {
    values.push(filters.memberId);
    conditions.push(
      `EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id AND ea.family_member_id = $${values.length})`
    );
  }

  const result = await db.query<FamilyEvent>(
    `SELECT e.* FROM events e WHERE ${conditions.join(" AND ")} ORDER BY e.start_at ASC`,
    values
  );
  return withAssignees(result.rows);
}

export async function getEvent(familyId: string, eventId: string): Promise<FamilyEvent> {
  const db = await getDb();
  const result = await db.query<FamilyEvent>("SELECT * FROM events WHERE family_id = $1 AND id = $2", [
    familyId,
    eventId,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Evento no encontrado.");
  const [withAssignee] = await withAssignees(result.rows);
  return withAssignee;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  category?: EventCategory;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  assigneeIds?: string[];
  source?: Source;
  createdBy?: string | null;
}

/** Returns other events assigned to the same members that overlap the given time window. */
export async function findConflicts(
  familyId: string,
  assigneeIds: string[],
  startAt: string,
  endAt: string | null,
  excludeEventId?: string
): Promise<FamilyEvent[]> {
  if (assigneeIds.length === 0) return [];
  const db = await getDb();
  const effectiveEnd = endAt ?? startAt;
  const result = await db.query<FamilyEvent>(
    `SELECT DISTINCT e.* FROM events e
     JOIN event_assignments ea ON ea.event_id = e.id
     WHERE e.family_id = $1
       AND ea.family_member_id = ANY($2::uuid[])
       AND e.id != COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)
       AND e.start_at <= $5::timestamptz AND COALESCE(e.end_at, e.start_at) >= $4::timestamptz
     ORDER BY e.start_at ASC`,
    [familyId, assigneeIds, excludeEventId ?? null, startAt, effectiveEnd]
  );
  return withAssignees(result.rows);
}

export async function createEvent(
  familyId: string,
  input: CreateEventInput
): Promise<{ event: FamilyEvent; conflicts: FamilyEvent[] }> {
  const db = await getDb();
  const eventId = newId();
  await db.query(
    `INSERT INTO events (id, family_id, title, description, category, start_at, end_at, all_day, location, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      eventId,
      familyId,
      input.title.trim(),
      input.description ?? null,
      input.category ?? "family",
      input.startAt,
      input.endAt ?? null,
      input.allDay ?? false,
      input.location ?? null,
      input.source ?? "manual",
      input.createdBy ?? null,
    ]
  );
  for (const memberId of input.assigneeIds ?? []) {
    await db.query(
      `INSERT INTO event_assignments (id, event_id, family_member_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [newId(), eventId, memberId]
    );
  }

  const conflicts = await findConflicts(
    familyId,
    input.assigneeIds ?? [],
    input.startAt,
    input.endAt ?? null,
    eventId
  );
  const event = await getEvent(familyId, eventId);
  return { event, conflicts };
}

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  category?: EventCategory;
  startAt?: string;
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  assigneeIds?: string[];
}

export async function updateEvent(
  familyId: string,
  eventId: string,
  input: UpdateEventInput
): Promise<FamilyEvent> {
  await getEvent(familyId, eventId);
  const db = await getDb();

  const columnMap: Record<string, unknown> = {};
  if (input.title !== undefined) columnMap.title = input.title.trim();
  if (input.description !== undefined) columnMap.description = input.description;
  if (input.category !== undefined) columnMap.category = input.category;
  if (input.startAt !== undefined) columnMap.start_at = input.startAt;
  if (input.endAt !== undefined) columnMap.end_at = input.endAt;
  if (input.allDay !== undefined) columnMap.all_day = input.allDay;
  if (input.location !== undefined) columnMap.location = input.location;

  const fields = Object.keys(columnMap);
  if (fields.length > 0) {
    const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
    const values = fields.map((field) => columnMap[field]);
    await db.query(
      `UPDATE events SET ${setClauses.join(", ")}, updated_at = now() WHERE family_id = $1 AND id = $2`,
      [familyId, eventId, ...values]
    );
  }

  if (input.assigneeIds !== undefined) {
    await db.query("DELETE FROM event_assignments WHERE event_id = $1", [eventId]);
    for (const memberId of input.assigneeIds) {
      await db.query(
        `INSERT INTO event_assignments (id, event_id, family_member_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [newId(), eventId, memberId]
      );
    }
  }

  return getEvent(familyId, eventId);
}

export async function deleteEvent(familyId: string, eventId: string): Promise<void> {
  await getEvent(familyId, eventId);
  const db = await getDb();
  await db.query("DELETE FROM events WHERE family_id = $1 AND id = $2", [familyId, eventId]);
}
