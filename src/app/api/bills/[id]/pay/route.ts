import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { payBill } from "@/services/bills";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "bills:manage");
    const { id } = await params;
    const bill = await payBill(session.familyId, id, session.familyMemberId);
    return { bill };
  });
}
