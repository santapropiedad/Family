import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { rejectPendingAction } from "@/ai/executor";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "ai:use");
    const { id } = await params;
    await rejectPendingAction(
      { familyId: session.familyId, actorMemberId: session.familyMemberId, actorRole: session.role },
      id
    );
    return { rejected: true };
  });
}
