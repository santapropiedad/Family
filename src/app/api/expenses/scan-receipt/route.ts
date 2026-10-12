import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { scanReceiptSchema } from "@/lib/validation";
import { scanReceiptImage } from "@/ai/receipt";
import { createExpense, findCategoryByName } from "@/services/expenses";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    const input = await parseBody(req, scanReceiptSchema);

    const extracted = await scanReceiptImage(input.imageBase64, input.mimeType);
    const category = extracted.categoryName
      ? await findCategoryByName(session.familyId, extracted.categoryName)
      : null;

    const expense = await createExpense(session.familyId, {
      amount: extracted.amount,
      categoryId: category?.id ?? null,
      merchant: extracted.merchant,
      spentAt: extracted.spentAt ?? undefined,
      description: extracted.description,
      familyMemberId: session.familyMemberId,
      createdBy: session.familyMemberId,
      source: "receipt_scan",
    });

    return { expense, extracted };
  });
}
