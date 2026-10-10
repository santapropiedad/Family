import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { buildTodaySummary } from "@/services/insights";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return await buildTodaySummary(session.familyId);
  });
}
