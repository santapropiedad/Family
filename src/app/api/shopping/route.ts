import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { addShoppingItemSchema } from "@/lib/validation";
import { addShoppingItem, listShoppingItems } from "@/services/shopping";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "purchased" | null;
    const items = await listShoppingItems(session.familyId, status ?? undefined);
    return { items };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "shopping:manage");
    const input = await parseBody(req, addShoppingItemSchema);
    const item = await addShoppingItem(session.familyId, input);
    return { item };
  });
}
