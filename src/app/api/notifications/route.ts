import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { listNotifications } from "@/services/notifications";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { notifications: await listNotifications(session.familyId, session.familyMemberId) };
  });
}
