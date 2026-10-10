import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import type { Notification } from "@/types/domain";

export async function listNotifications(familyId: string, memberId?: string): Promise<Notification[]> {
  const db = await getDb();
  const result = await db.query<Notification>(
    `SELECT * FROM notifications WHERE family_id = $1 AND (family_member_id IS NULL OR family_member_id = $2)
     ORDER BY created_at DESC LIMIT 50`,
    [familyId, memberId ?? null]
  );
  return result.rows;
}

export interface CreateNotificationInput {
  familyMemberId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  priority?: Notification["priority"];
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

/**
 * Crea una notificación evitando duplicados recientes del mismo tipo+entidad
 * (requisito de "no generar notificaciones excesivas").
 */
export async function createNotification(
  familyId: string,
  input: CreateNotificationInput
): Promise<Notification | null> {
  const db = await getDb();
  if (input.relatedEntityId) {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM notifications WHERE family_id = $1 AND type = $2 AND related_entity_id = $3
         AND created_at > now() - interval '20 hours'`,
      [familyId, input.type, input.relatedEntityId]
    );
    if (existing.rows.length > 0) return null;
  }

  const result = await db.query<Notification>(
    `INSERT INTO notifications (id, family_id, family_member_id, type, title, body, priority, related_entity_type, related_entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      newId(),
      familyId,
      input.familyMemberId ?? null,
      input.type,
      input.title,
      input.body ?? null,
      input.priority ?? "medium",
      input.relatedEntityType ?? null,
      input.relatedEntityId ?? null,
    ]
  );
  return result.rows[0];
}

export async function markNotificationRead(familyId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.query("UPDATE notifications SET read_at = now() WHERE family_id = $1 AND id = $2", [
    familyId,
    id,
  ]);
}
