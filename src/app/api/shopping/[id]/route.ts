import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { removeShoppingItem, updateShoppingItem } from "@/services/shopping";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  quantity: z.number().positive().max(100000).optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  priority: z.enum(["red", "yellow", "green"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  store: z.string().trim().max(80).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "shopping:manage");
    const { id } = await params;
    const input = await parseBody(req, patchSchema);
    const item = await updateShoppingItem(session.familyId, id, {
      name: input.name,
      quantity: input.quantity !== undefined ? String(input.quantity) : undefined,
      unit: input.unit,
      priority: input.priority,
      assigned_to: input.assigned_to,
      store: input.store,
    });
    return { item };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "shopping:manage");
    const { id } = await params;
    await removeShoppingItem(session.familyId, id);
    return { deleted: true };
  });
}
