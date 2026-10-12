import { handleRoute } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFamily } from "@/services/families";
import { listMembers, getUserById } from "@/services/members";

export async function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return { session: null };
    const [family, members, user] = await Promise.all([
      getFamily(session.familyId),
      listMembers(session.familyId),
      getUserById(session.userId),
    ]);
    return { session: { ...session, email: user?.email ?? null }, family, members };
  });
}
