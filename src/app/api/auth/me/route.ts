import { handleRoute } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFamily } from "@/services/families";
import { listMembers } from "@/services/members";

export async function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return { session: null };
    const [family, members] = await Promise.all([
      getFamily(session.familyId),
      listMembers(session.familyId),
    ]);
    return { session, family, members };
  });
}
