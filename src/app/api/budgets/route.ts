import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { listBudgets, upsertBudget } from "@/services/expenses";

const upsertSchema = z.object({
  categoryId: z.string().uuid(),
  monthlyLimit: z.number().positive().max(100_000_000),
});

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:view");
    return { budgets: await listBudgets(session.familyId) };
  });
}

/** Modificar presupuestos es sensible (afecta las alertas de toda la familia), por eso solo admin/adulto. */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    const input = await parseBody(req, upsertSchema);
    const budget = await upsertBudget(session.familyId, input.categoryId, input.monthlyLimit);
    return { budget };
  });
}
