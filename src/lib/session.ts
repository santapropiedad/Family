import { cookies } from "next/headers";
import { JWT_COOKIE_NAME, verifySession, type SessionPayload } from "./auth";
import { AuthError } from "./errors";
import { getDb } from "@/db/client";

/**
 * Reads and verifies the session cookie for the current request (Server Components, Route Handlers).
 * Also confirms the family member the token points to still exists — a signature-valid JWT can
 * outlive the row it references (e.g. the family was deleted or the database was reset), and
 * treating that as "logged in" would make every downstream query fail instead of just asking the
 * person to log in again.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;
  if (!token) return null;
  let payload: SessionPayload;
  try {
    payload = verifySession(token);
  } catch {
    return null;
  }

  const db = await getDb();
  const result = await db.query<{ id: string }>(
    "SELECT id FROM family_members WHERE id = $1 AND family_id = $2",
    [payload.familyMemberId, payload.familyId]
  );
  if (result.rows.length === 0) return null;

  return payload;
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError("Debes iniciar sesión para continuar.");
  return session;
}
