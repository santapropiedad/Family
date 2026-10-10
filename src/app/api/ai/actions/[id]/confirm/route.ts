import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { confirmPendingAction } from "@/ai/executor";

/** El usuario confirma explícitamente una acción de IA pendiente (nunca se ejecuta solo porque el modelo lo pida). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "ai:use");
    const { id } = await params;
    return confirmPendingAction(
      { familyId: session.familyId, actorMemberId: session.familyMemberId, actorRole: session.role },
      id
    );
  });
}
