import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { listInventory, setInventoryStock } from "@/services/shopping";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { items: await listInventory(session.familyId) };
  });
}

const setStockSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().nonnegative().max(1_000_000),
  unit: z.string().trim().max(30).nullable().optional(),
  store: z.string().trim().max(80).nullable().optional(),
});

/** Crea o fija directamente el stock de un producto (control de inventario, sin que sea una compra). */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "inventory:manage");
    const input = await parseBody(req, setStockSchema);
    const item = await setInventoryStock(session.familyId, input.name, input);
    return { item };
  });
}
