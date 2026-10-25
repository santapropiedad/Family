import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createCategorySchema } from "@/lib/validation";
import { createCategory, listCategories } from "@/services/expenses";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { categories: await listCategories(session.familyId) };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    const input = await parseBody(req, createCategorySchema);
    const category = await createCategory(session.familyId, input);
    return { category };
  });
}
