import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Role } from "./permissions";
import { AuthError } from "./errors";

const JWT_COOKIE_NAME = "familia_session";
// Un año: esta app corre típicamente en el computador/teléfono de confianza de la familia,
// así que se prioriza no pedir login constantemente sobre una expiración corta.
const JWT_EXPIRES_IN = "365d";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET no está configurado. Defínelo en .env.local (ver .env.example)."
    );
  }
  return secret;
}

export interface SessionPayload {
  userId: string;
  familyMemberId: string;
  familyId: string;
  role: Role;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifySession(token: string): SessionPayload {
  try {
    return jwt.verify(token, getJwtSecret()) as unknown as SessionPayload;
  } catch {
    throw new AuthError("Tu sesión expiró o no es válida. Inicia sesión nuevamente.");
  }
}

export { JWT_COOKIE_NAME };
