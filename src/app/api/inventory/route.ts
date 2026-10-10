import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { listInventory } from "@/services/shopping";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { items: await listInventory(session.familyId) };
  });
}
