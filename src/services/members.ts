import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { AppError, AuthError, NotFoundError } from "@/lib/errors";
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

export interface SetMemberLoginInput {
  email?: string;
  password?: string;
}

/**
 * Un administrador da o modifica el acceso de login de otro integrante: crea una cuenta nueva
 * (ej. alguien que nunca tuvo una), cambia solo el correo, o solo la contraseña (ej. la olvidó).
 * A diferencia de `updateCredentials`, esto no exige la contraseña actual del integrante: la
 * autoridad viene del rol de quien lo ejecuta (verificado por capability en la ruta), no de
 * conocer la contraseña de otra persona.
 */
export async function setMemberLogin(
  familyId: string,
  memberId: string,
  input: SetMemberLoginInput
): Promise<void> {
  await getMember(familyId, memberId);
  const db = await getDb();

  const currentLogin = await db.query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE family_member_id = $1",
    [memberId]
  );
  const hasLogin = currentLogin.rows.length > 0;

  if (!hasLogin && (!input.email || !input.password)) {
    throw new AppError(
      "Este integrante todavía no tiene cuenta: indica correo y contraseña para crearla.",
      400,
      "login_required_fields"
    );
  }

  if (input.email) {
    const email = input.email.toLowerCase().trim();
    const existingEmail = await db.query<{ id: string; family_member_id: string }>(
      "SELECT id, family_member_id FROM users WHERE email = $1",
      [email]
    );
    if (existingEmail.rows.length > 0 && existingEmail.rows[0].family_member_id !== memberId) {
      throw new AppError("Ya existe una cuenta con ese correo electrónico.", 409, "email_taken");
    }
  }

  if (!hasLogin) {
    const passwordHash = await hashPassword(input.password!);
    await db.query(
      `INSERT INTO users (id, family_member_id, email, password_hash) VALUES ($1, $2, $3, $4)`,
      [newId(), memberId, input.email!.toLowerCase().trim(), passwordHash]
    );
    return;
  }

  if (input.email) {
    await db.query("UPDATE users SET email = $1, updated_at = now() WHERE family_member_id = $2", [
      input.email.toLowerCase().trim(),
      memberId,
    ]);
  }
  if (input.password) {
    const passwordHash = await hashPassword(input.password);
    await db.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE family_member_id = $2", [
      passwordHash,
      memberId,
    ]);
  }
}

export async function getUserById(userId: string): Promise<AppUser | null> {
  const db = await getDb();
  const result = await db.query<AppUser>("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0] ?? null;
}

export interface UpdateCredentialsInput {
  currentPassword: string;
  newEmail?: string;
  newPassword?: string;
}

/**
 * Cambia el correo y/o la contraseña de inicio de sesión del propio usuario.
 * Exige la contraseña actual (aunque la sesión ya esté autenticada) como defensa extra:
 * en un dispositivo familiar compartido, alguien con el navegador abierto no debería poder
 * tomar el control de la cuenta solo por tener la pestaña a mano.
 */
export async function updateCredentials(userId: string, input: UpdateCredentialsInput): Promise<void> {
  const user = await getUserById(userId);
  if (!user) throw new NotFoundError("Cuenta no encontrada.");

  const ok = await verifyPassword(input.currentPassword, user.password_hash);
  if (!ok) throw new AuthError("La contraseña actual no es correcta.");

  const db = await getDb();
  if (input.newEmail && input.newEmail.toLowerCase().trim() !== user.email) {
    const email = input.newEmail.toLowerCase().trim();
    const existing = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 AND id != $2", [
      email,
      userId,
    ]);
    if (existing.rows.length > 0) {
      throw new AppError("Ya existe una cuenta con ese correo electrónico.", 409, "email_taken");
    }
    await db.query("UPDATE users SET email = $1, updated_at = now() WHERE id = $2", [email, userId]);
  }

  if (input.newPassword) {
    const passwordHash = await hashPassword(input.newPassword);
    await db.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
      passwordHash,
      userId,
    ]);
  }
}
