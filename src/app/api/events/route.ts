import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createEventSchema } from "@/lib/validation";
import { createEvent, listEvents } from "@/services/events";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const events = await listEvents(session.familyId, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      memberId: searchParams.get("memberId") ?? undefined,
    });
    return { events };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "events:manage");
    const input = await parseBody(req, createEventSchema);
    const { event, conflicts } = await createEvent(session.familyId, {
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      allDay: input.allDay,
      location: input.location ?? null,
      assigneeIds: input.assigneeIds,
      createdBy: session.familyMemberId,
    });
    return { event, conflicts };
  });
}
