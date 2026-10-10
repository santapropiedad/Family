import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { getFamily, updateFamilySettings } from "@/services/families";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  ai_enabled: z.boolean().optional(),
  ai_memory_enabled: z.boolean().optional(),
  ai_proactive_enabled: z.boolean().optional(),
  shopping_suggestions_enabled: z.boolean().optional(),
});

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { family: await getFamily(session.familyId) };
  });
}

export async function PATCH(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "family:configure");
    const input = await parseBody(req, patchSchema);
    const family = await updateFamilySettings(session.familyId, input);
    return { family };
  });
}
