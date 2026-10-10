import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { deleteEvent, updateEvent } from "@/services/events";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z
    .enum(["birthday", "school", "appointment", "activity", "vacation", "payment", "maintenance", "family", "other"])
    .optional(),
  startAt: z.string().trim().optional(),
  endAt: z.string().trim().nullable().optional(),
  allDay: z.boolean().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "events:manage");
    const { id } = await params;
    const input = await parseBody(req, patchSchema);
    const event = await updateEvent(session.familyId, id, input);
    return { event };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "events:manage");
    const { id } = await params;
    await deleteEvent(session.familyId, id);
    return { deleted: true };
  });
}
