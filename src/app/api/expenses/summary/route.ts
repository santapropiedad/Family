import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { getBudgetStatus, summarizeByCategory, totalForPeriod } from "@/services/expenses";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:view");
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) throw new AppError("Debes indicar un rango de fechas (from, to).", 400, "missing_range");

    const [byCategory, total, budgets] = await Promise.all([
      summarizeByCategory(session.familyId, from, to),
      totalForPeriod(session.familyId, from, to),
      getBudgetStatus(session.familyId, from, to),
    ]);
    return { total, byCategory, budgets };
  });
}
