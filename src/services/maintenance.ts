import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { Maintenance } from "@/types/domain";

export async function listMaintenance(familyId: string): Promise<Maintenance[]> {
  const db = await getDb();
  const result = await db.query<Maintenance>(
    "SELECT * FROM maintenance WHERE family_id = $1 ORDER BY next_maintenance_at ASC NULLS LAST",
    [familyId]
  );
  return result.rows;
}

export async function getMaintenance(familyId: string, id: string): Promise<Maintenance> {
  const db = await getDb();
  const result = await db.query<Maintenance>("SELECT * FROM maintenance WHERE family_id = $1 AND id = $2", [
    familyId,
    id,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Mantención no encontrada.");
  return result.rows[0];
}

export interface CreateMaintenanceInput {
  name: string;
  location?: string | null;
  purchaseDate?: string | null;
  warrantyUntil?: string | null;
  lastMaintenanceAt?: string | null;
  nextMaintenanceAt?: string | null;
  frequencyDays?: number | null;
  provider?: string | null;
  cost?: number | null;
  notes?: string | null;
}

export async function createMaintenance(familyId: string, input: CreateMaintenanceInput): Promise<Maintenance> {
  const db = await getDb();
  const result = await db.query<Maintenance>(
    `INSERT INTO maintenance
       (id, family_id, name, location, purchase_date, warranty_until, last_maintenance_at, next_maintenance_at, frequency_days, provider, cost, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      newId(),
      familyId,
      input.name.trim(),
      input.location ?? null,
      input.purchaseDate ?? null,
      input.warrantyUntil ?? null,
      input.lastMaintenanceAt ?? null,
      input.nextMaintenanceAt ?? null,
      input.frequencyDays ?? null,
      input.provider ?? null,
      input.cost ?? null,
      input.notes ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateMaintenance(
  familyId: string,
  id: string,
  patch: Partial<CreateMaintenanceInput>
): Promise<Maintenance> {
  await getMaintenance(familyId, id);
  const db = await getDb();
  const columnMap: Record<string, unknown> = {};
  if (patch.name !== undefined) columnMap.name = patch.name;
  if (patch.location !== undefined) columnMap.location = patch.location;
  if (patch.purchaseDate !== undefined) columnMap.purchase_date = patch.purchaseDate;
  if (patch.warrantyUntil !== undefined) columnMap.warranty_until = patch.warrantyUntil;
  if (patch.lastMaintenanceAt !== undefined) columnMap.last_maintenance_at = patch.lastMaintenanceAt;
  if (patch.nextMaintenanceAt !== undefined) columnMap.next_maintenance_at = patch.nextMaintenanceAt;
  if (patch.frequencyDays !== undefined) columnMap.frequency_days = patch.frequencyDays;
  if (patch.provider !== undefined) columnMap.provider = patch.provider;
  if (patch.cost !== undefined) columnMap.cost = patch.cost;
  if (patch.notes !== undefined) columnMap.notes = patch.notes;

  const fields = Object.keys(columnMap);
  if (fields.length === 0) return getMaintenance(familyId, id);
  const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
  const values = fields.map((field) => columnMap[field]);
  const result = await db.query<Maintenance>(
    `UPDATE maintenance SET ${setClauses.join(", ")}, updated_at = now() WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, id, ...values]
  );
  return result.rows[0];
}

/** Marca realizada una mantención hoy y calcula la próxima según su frecuencia. */
export async function completeMaintenance(familyId: string, id: string): Promise<Maintenance> {
  const item = await getMaintenance(familyId, id);
  const today = new Date().toISOString().slice(0, 10);
  let next: string | null = null;
  if (item.frequency_days) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + item.frequency_days);
    next = nextDate.toISOString().slice(0, 10);
  }
  return updateMaintenance(familyId, id, { lastMaintenanceAt: today, nextMaintenanceAt: next });
}

export async function deleteMaintenance(familyId: string, id: string): Promise<void> {
  await getMaintenance(familyId, id);
  const db = await getDb();
  await db.query("DELETE FROM maintenance WHERE family_id = $1 AND id = $2", [familyId, id]);
}
