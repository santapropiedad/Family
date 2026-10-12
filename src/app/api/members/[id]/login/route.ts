import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { setMemberLoginSchema } from "@/lib/validation";
import { setMemberLogin } from "@/services/members";

/** Un administrador crea o modifica el acceso de login de otro integrante. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "family:manage_members");
    const { id } = await params;
    const input = await parseBody(req, setMemberLoginSchema);
    await setMemberLogin(session.familyId, id, input);
    return { ok: true };
  });
}
