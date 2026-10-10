import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createExpenseSchema } from "@/lib/validation";
import { createExpense, listExpenses } from "@/services/expenses";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:view");
    const { searchParams } = new URL(req.url);
    const expenses = await listExpenses(session.familyId, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      memberId: searchParams.get("memberId") ?? undefined,
    });
    return { expenses };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    const input = await parseBody(req, createExpenseSchema);
    const expense = await createExpense(session.familyId, {
      ...input,
      familyMemberId: input.familyMemberId ?? session.familyMemberId,
      createdBy: session.familyMemberId,
    });
    return { expense };
  });
}
