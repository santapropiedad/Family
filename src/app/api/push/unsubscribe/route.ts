import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { unsubscribePushSchema } from "@/lib/validation";
import { removePushSubscription } from "@/services/push";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    await requireSession();
    const input = await parseBody(req, unsubscribePushSchema);
    await removePushSubscription(input.endpoint);
    return { ok: true };
  });
}
