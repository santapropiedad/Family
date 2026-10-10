import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { recordPurchaseSchema } from "@/lib/validation";
import { recordPurchase } from "@/services/shopping";

/** El flujo conectado "compré X por $Y": gasto + inventario + lista de compras en una sola llamada. */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "shopping:manage");
    const input = await parseBody(req, recordPurchaseSchema);
    const result = await recordPurchase(session.familyId, {
      ...input,
      familyMemberId: session.familyMemberId,
      createdBy: session.familyMemberId,
    });
    return result;
  });
}
