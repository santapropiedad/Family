import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import type { Family, FamilyMember, AppUser } from "@/types/domain";

const DEFAULT_CATEGORIES: Array<{ name: string; icon: string; color: string }> = [
  { name: "Alimentación", icon: "🛒", color: "#f59e0b" },
  { name: "Vivienda", icon: "🏠", color: "#6366f1" },
  { name: "Servicios", icon: "💡", color: "#0ea5e9" },
  { name: "Transporte", icon: "🚗", color: "#64748b" },
  { name: "Educación", icon: "📚", color: "#8b5cf6" },
  { name: "Salud", icon: "🩺", color: "#ef4444" },
  { name: "Niños", icon: "🧸", color: "#ec4899" },
  { name: "Entretenimiento", icon: "🎉", color: "#14b8a6" },
  { name: "Compras", icon: "🛍️", color: "#f97316" },
  { name: "Mascotas", icon: "🐾", color: "#84cc16" },
  { name: "Otros", icon: "📦", color: "#78716c" },
];

export async function seedDefaultCategories(familyId: string): Promise<void> {
  const db = await getDb();
  for (const cat of DEFAULT_CATEGORIES) {
    await db.query(
      `INSERT INTO expense_categories (id, family_id, name, icon, color, is_default)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [newId(), familyId, cat.name, cat.icon, cat.color]
    );
  }
}

export interface CreateFamilyInput {
  familyName: string;
  adminName: string;
  email: string;
  password: string;
}

export interface CreateFamilyResult {
  family: Family;
  member: FamilyMember;
  user: AppUser;
}

/** Creates a new family with its first administrator, a default shopping list, and base expense categories. */
export async function createFamilyWithAdmin(input: CreateFamilyInput): Promise<CreateFamilyResult> {
  const db = await getDb();

  const existing = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    input.email.toLowerCase().trim(),
  ]);
  if (existing.rows.length > 0) {
    throw new AppError("Ya existe una cuenta con ese correo electrónico.", 409, "email_taken");
  }

  const familyId = newId();
  const memberId = newId();
  const userId = newId();
  const passwordHash = await hashPassword(input.password);

  const familyResult = await db.query<Family>(
    `INSERT INTO families (id, name) VALUES ($1, $2) RETURNING *`,
    [familyId, input.familyName.trim()]
  );
  const memberResult = await db.query<FamilyMember>(
    `INSERT INTO family_members (id, family_id, name, role, color, avatar_emoji)
     VALUES ($1, $2, $3, 'admin', '#6366f1', '⭐') RETURNING *`,
    [memberId, familyId, input.adminName.trim()]
  );
  const userResult = await db.query<AppUser>(
    `INSERT INTO users (id, family_member_id, email, password_hash)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, memberId, input.email.toLowerCase().trim(), passwordHash]
  );

  await seedDefaultCategories(familyId);
  await db.query(`INSERT INTO shopping_lists (id, family_id, name) VALUES ($1, $2, 'Lista principal')`, [
    newId(),
    familyId,
  ]);

  return { family: familyResult.rows[0], member: memberResult.rows[0], user: userResult.rows[0] };
}

export async function getFamily(familyId: string): Promise<Family> {
  const db = await getDb();
  const result = await db.query<Family>("SELECT * FROM families WHERE id = $1", [familyId]);
  if (result.rows.length === 0) throw new AppError("Familia no encontrada.", 404, "not_found");
  return result.rows[0];
}

export async function updateFamilySettings(
  familyId: string,
  patch: Partial<
    Pick<Family, "name" | "ai_enabled" | "ai_memory_enabled" | "ai_proactive_enabled" | "shopping_suggestions_enabled">
  >
): Promise<Family> {
  const db = await getDb();
  const fields = Object.keys(patch) as Array<keyof typeof patch>;
  if (fields.length === 0) return getFamily(familyId);

  const setClauses = fields.map((field, i) => `${field} = $${i + 2}`);
  const values = fields.map((field) => patch[field]);
  const result = await db.query<Family>(
    `UPDATE families SET ${setClauses.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
    [familyId, ...values]
  );
  return result.rows[0];
}
