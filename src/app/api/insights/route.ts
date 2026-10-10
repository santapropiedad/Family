import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { detectInsights } from "@/services/insights";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { insights: await detectInsights(session.familyId) };
  });
}
