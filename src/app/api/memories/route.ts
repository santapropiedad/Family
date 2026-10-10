import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { clearAllMemories, createMemory, listMemories } from "@/services/memories";

const createSchema = z.object({
  type: z.enum(["permanent", "temporary"]),
  category: z.string().trim().max(60).nullable().optional(),
  content: z.string().trim().min(1).max(500),
  relatedFamilyMemberId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().trim().nullable().optional(),
});

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { memories: await listMemories(session.familyId) };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "memory:manage");
    const input = await parseBody(req, createSchema);
    const memory = await createMemory(session.familyId, { ...input, createdBy: "user" });
    return { memory };
  });
}

/** Borra TODA la memoria de la familia (botón "Desactivar memoria" en Familia). Acción destructiva deliberada. */
export async function DELETE() {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "memory:manage");
    await clearAllMemories(session.familyId);
    return { cleared: true };
  });
}
