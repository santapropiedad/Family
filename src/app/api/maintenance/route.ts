import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createMaintenanceSchema } from "@/lib/validation";
import { createMaintenance, listMaintenance } from "@/services/maintenance";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { items: await listMaintenance(session.familyId) };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "maintenance:manage");
    const input = await parseBody(req, createMaintenanceSchema);
    const item = await createMaintenance(session.familyId, input);
    return { item };
  });
}
