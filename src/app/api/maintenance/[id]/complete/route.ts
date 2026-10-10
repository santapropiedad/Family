import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { completeMaintenance } from "@/services/maintenance";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "maintenance:manage");
    const { id } = await params;
    const item = await completeMaintenance(session.familyId, id);
    return { item };
  });
}
