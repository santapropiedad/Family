import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { listCategories } from "@/services/expenses";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { categories: await listCategories(session.familyId) };
  });
}
