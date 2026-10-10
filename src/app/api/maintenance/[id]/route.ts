import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createMaintenanceSchema } from "@/lib/validation";
import { deleteMaintenance, updateMaintenance } from "@/services/maintenance";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "maintenance:manage");
    const { id } = await params;
    const input = await parseBody(req, createMaintenanceSchema.partial());
    const item = await updateMaintenance(session.familyId, id, input);
    return { item };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "maintenance:manage");
    const { id } = await params;
    await deleteMaintenance(session.familyId, id);
    return { deleted: true };
  });
}
