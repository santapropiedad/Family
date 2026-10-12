import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { updateCredentialsSchema } from "@/lib/validation";
import { updateCredentials } from "@/services/members";

/** Cambia el correo y/o la contraseña de inicio de sesión del usuario autenticado (solo la propia). */
export async function PATCH(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const input = await parseBody(req, updateCredentialsSchema);
    await updateCredentials(session.userId, input);
    return { ok: true };
  });
}
