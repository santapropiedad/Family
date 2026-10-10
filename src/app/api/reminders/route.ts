import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createReminderSchema } from "@/lib/validation";
import { createReminder, listReminders } from "@/services/reminders";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "done" | "dismissed" | null;
    const reminders = await listReminders(session.familyId, { status: status ?? undefined });
    return { reminders };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "reminders:manage");
    const input = await parseBody(req, createReminderSchema);
    const reminder = await createReminder(session.familyId, {
      ...input,
      createdBy: session.familyMemberId,
    });
    return { reminder };
  });
}
