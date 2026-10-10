import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { chatMessageSchema } from "@/lib/validation";
import { sendChatMessage } from "@/ai/chat";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "ai:use");
    const { text } = await parseBody(req, chatMessageSchema);
    return sendChatMessage(
      { familyId: session.familyId, actorMemberId: session.familyMemberId, actorRole: session.role },
      text
    );
  });
}
