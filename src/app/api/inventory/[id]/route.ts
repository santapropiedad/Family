import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { updateInventoryItem } from "@/services/shopping";

const patchSchema = z.object({
  current_quantity: z.number().nonnegative().max(1_000_000).optional(),
  min_quantity: z.number().nonnegative().max(1_000_000).nullable().optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  auto_suggest: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "inventory:manage");
    const { id } = await params;
    const input = await parseBody(req, patchSchema);
    const item = await updateInventoryItem(session.familyId, id, {
      current_quantity: input.current_quantity !== undefined ? String(input.current_quantity) : undefined,
      min_quantity: input.min_quantity !== undefined ? (input.min_quantity === null ? null : String(input.min_quantity)) : undefined,
      unit: input.unit,
      auto_suggest: input.auto_suggest,
    });
    return { item };
  });
}
