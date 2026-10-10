import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createBillSchema } from "@/lib/validation";
import { createBill, listBills, markOverdueBills } from "@/services/bills";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    await markOverdueBills(session.familyId);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "paid" | "overdue" | null;
    const bills = await listBills(session.familyId, status ?? undefined);
    return { bills };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "bills:manage");
    const input = await parseBody(req, createBillSchema);
    const bill = await createBill(session.familyId, input);
    return { bill };
  });
}
