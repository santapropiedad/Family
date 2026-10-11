import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { Memory } from "@/types/domain";

export async function listMemories(familyId: string, onlyActive = true): Promise<Memory[]> {
  const db = await getDb();
  const conditions = ["family_id = $1"];
  const values: unknown[] = [familyId];
  if (onlyActive) {
    conditions.push("is_active = TRUE");
    conditions.push("(expires_at IS NULL OR expires_at > now())");
  }
  const result = await db.query<Memory>(
    `SELECT * FROM memories WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    values
  );
  return result.rows;
}

export interface CreateMemoryInput {
  type: Memory["type"];
  category?: string | null;
  content: string;
  relatedFamilyMemberId?: string | null;
  expiresAt?: string | null;
  createdBy?: Memory["created_by"];
}

export async function createMemory(familyId: string, input: CreateMemoryInput): Promise<Memory> {
  const db = await getDb();
  const result = await db.query<Memory>(
    `INSERT INTO memories (id, family_id, type, category, content, related_family_member_id, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      newId(),
      familyId,
      input.type,
      input.category ?? null,
      input.content.trim(),
      input.relatedFamilyMemberId ?? null,
      input.expiresAt ?? null,
      input.createdBy ?? "ai",
    ]
  );
  return result.rows[0];
}

export async function updateMemory(
  familyId: string,
  id: string,
  patch: Partial<Pick<Memory, "content" | "category" | "is_active" | "expires_at">>
): Promise<Memory> {
  const db = await getDb();
  const fields = (Object.keys(patch) as Array<keyof typeof patch>).filter((f) => patch[f] !== undefined);
  if (fields.length === 0) {
    const existing = await db.query<Memory>("SELECT * FROM memories WHERE family_id = $1 AND id = $2", [
      familyId,
      id,
    ]);
    if (existing.rows.length === 0) throw new NotFoundError("Memoria no encontrada.");
    return existing.rows[0];
  }
  const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
  const values = fields.map((field) => patch[field]);
  const result = await db.query<Memory>(
    `UPDATE memories SET ${setClauses.join(", ")}, updated_at = now() WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, id, ...values]
  );
  if (result.rows.length === 0) throw new NotFoundError("Memoria no encontrada.");
  return result.rows[0];
}

export async function deleteMemory(familyId: string, id: string): Promise<void> {
  const db = await getDb();
  const result = await db.query("DELETE FROM memories WHERE family_id = $1 AND id = $2", [familyId, id]);
  if (result.rowCount === 0) throw new NotFoundError("Memoria no encontrada.");
}

/** Borra todas las memorias de la familia (botón "desactivar/borrar memoria" en Familia). */
export async function clearAllMemories(familyId: string): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM memories WHERE family_id = $1", [familyId]);
}
