import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { z } from "zod";
import { removeMember, updateMember } from "@/services/members";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(["admin", "adult", "child"]).optional(),
  color: z.string().trim().max(20).optional(),
  avatar_emoji: z.string().trim().max(8).nullable().optional(),
  birth_date: z.string().trim().max(10).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { id } = await params;
    const isSelf = id === session.familyMemberId;
    if (!isSelf) assertCapability(session.role, "family:manage_members");
    const input = await parseBody(req, patchSchema);
    // Cambiar el rol siempre requiere el permiso de administrador, incluso editando el propio
    // perfil — de lo contrario cualquier integrante podría auto-ascenderse a administrador.
    if (input.role !== undefined) assertCapability(session.role, "family:manage_members");
    const member = await updateMember(session.familyId, id, input);
    return { member };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "family:manage_members");
    const { id } = await params;
    await removeMember(session.familyId, id);
    return { deleted: true };
  });
}
