import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { deleteReminder, updateReminder } from "@/services/reminders";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  remind_at: z.string().trim().optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  status: z.enum(["pending", "done", "dismissed"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "reminders:manage");
    const { id } = await params;
    const input = await parseBody(req, patchSchema);
    const reminder = await updateReminder(session.familyId, id, input);
    return { reminder };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "reminders:manage");
    const { id } = await params;
    await deleteReminder(session.familyId, id);
    return { deleted: true };
  });
}
