import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { confirmarBoletaSchema } from "@/lib/validation";
import { confirmReceiptExpense } from "@/services/receipts";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    const input = await parseBody(req, confirmarBoletaSchema);
    const result = await confirmReceiptExpense(session.familyId, session.familyMemberId, {
      total: input.total,
      spentAt: input.spentAt,
      merchant: input.merchant ?? null,
      receiptNumber: input.receiptNumber ?? null,
      familyMemberId: session.familyMemberId,
      items: input.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice ?? null,
        lineTotal: item.lineTotal ?? null,
      })),
    });
    return result;
  });
}
