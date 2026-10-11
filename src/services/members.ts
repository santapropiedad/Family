import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/auth";
import { AppError, NotFoundError } from "@/lib/errors";
import type { Role } from "@/lib/permissions";
import type { AppUser, FamilyMember } from "@/types/domain";

export async function listMembers(familyId: string): Promise<FamilyMember[]> {
  const db = await getDb();
  const result = await db.query<FamilyMember>(
    "SELECT * FROM family_members WHERE family_id = $1 ORDER BY created_at ASC",
    [familyId]
  );
  return result.rows;
}

export async function getMember(familyId: string, memberId: string): Promise<FamilyMember> {
  const db = await getDb();
  const result = await db.query<FamilyMember>(
    "SELECT * FROM family_members WHERE family_id = $1 AND id = $2",
    [familyId, memberId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Integrante no encontrado.");
  return result.rows[0];
}

export interface AddMemberInput {
  name: string;
  role: Role;
  color?: string;
  avatarEmoji?: string;
  birthDate?: string | null;
  /** Optional: grants this member their own login. */
  login?: { email: string; password: string };
}

export async function addMember(familyId: string, input: AddMemberInput): Promise<FamilyMember> {
  const db = await getDb();
  const memberId = newId();
  const result = await db.query<FamilyMember>(
    `INSERT INTO family_members (id, family_id, name, role, color, avatar_emoji, birth_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      memberId,
      familyId,
      input.name.trim(),
      input.role,
      input.color ?? "#6366f1",
      input.avatarEmoji ?? null,
      input.birthDate ?? null,
    ]
  );

  if (input.login) {
    const existing = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      input.login.email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      throw new AppError("Ya existe una cuenta con ese correo electrónico.", 409, "email_taken");
    }
    const passwordHash = await hashPassword(input.login.password);
    await db.query(
      `INSERT INTO users (id, family_member_id, email, password_hash) VALUES ($1, $2, $3, $4)`,
      [newId(), memberId, input.login.email.toLowerCase().trim(), passwordHash]
    );
  }

  return result.rows[0];
}

export async function updateMember(
  familyId: string,
  memberId: string,
  patch: Partial<Pick<FamilyMember, "name" | "role" | "color" | "avatar_emoji" | "birth_date">>
): Promise<FamilyMember> {
  await getMember(familyId, memberId);
  const db = await getDb();
  const fields = (Object.keys(patch) as Array<keyof typeof patch>).filter((f) => patch[f] !== undefined);
  if (fields.length === 0) return getMember(familyId, memberId);

  const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
  const values = fields.map((field) => patch[field]);
  const result = await db.query<FamilyMember>(
    `UPDATE family_members SET ${setClauses.join(", ")}, updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, memberId, ...values]
  );
  return result.rows[0];
}

export async function removeMember(familyId: string, memberId: string): Promise<void> {
  await getMember(familyId, memberId);
  const db = await getDb();
  const admins = await db.query<{ count: string }>(
    "SELECT count(*) FROM family_members WHERE family_id = $1 AND role = 'admin'",
    [familyId]
  );
  const target = await getMember(familyId, memberId);
  if (target.role === "admin" && Number(admins.rows[0].count) <= 1) {
    throw new AppError("No puedes eliminar al único administrador de la familia.", 400, "last_admin");
  }
  await db.query("DELETE FROM family_members WHERE family_id = $1 AND id = $2", [familyId, memberId]);
}

export async function findUserByEmail(
  email: string
): Promise<(AppUser & { role: Role; family_id: string; name: string }) | null> {
  const db = await getDb();
  const result = await db.query<AppUser & { role: Role; family_id: string; name: string }>(
    `SELECT u.*, fm.role, fm.family_id, fm.name
     FROM users u JOIN family_members fm ON fm.id = u.family_member_id
     WHERE u.email = $1`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] ?? null;
}

export async function touchLastLogin(userId: string): Promise<void> {
  const db = await getDb();
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
}
