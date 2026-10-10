import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { markNotificationRead } from "@/services/notifications";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { id } = await params;
    await markNotificationRead(session.familyId, id);
    return { ok: true };
  });
}
