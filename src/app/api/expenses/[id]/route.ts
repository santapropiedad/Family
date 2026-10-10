import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { deleteExpense } from "@/services/expenses";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    const { id } = await params;
    await deleteExpense(session.familyId, id);
    return { deleted: true };
  });
}
