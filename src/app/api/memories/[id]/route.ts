import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { deleteMemory, updateMemory } from "@/services/memories";

const patchSchema = z.object({
  content: z.string().trim().min(1).max(500).optional(),
  category: z.string().trim().max(60).nullable().optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().trim().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "memory:manage");
    const { id } = await params;
    const input = await parseBody(req, patchSchema);
    const memory = await updateMemory(session.familyId, id, input);
    return { memory };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "memory:manage");
    const { id } = await params;
    await deleteMemory(session.familyId, id);
    return { deleted: true };
  });
}
