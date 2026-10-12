import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { pushSubscriptionSchema } from "@/lib/validation";
import { savePushSubscription } from "@/services/push";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const input = await parseBody(req, pushSubscriptionSchema);
    await savePushSubscription(session.familyId, session.familyMemberId, input);
    return { ok: true };
  });
}
