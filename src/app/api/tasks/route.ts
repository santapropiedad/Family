import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { createTaskSchema } from "@/lib/validation";
import { createTask, listTasks } from "@/services/tasks";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "completed" | "cancelled" | null;
    const assignedTo = searchParams.get("assignedTo");
    const tasks = await listTasks(session.familyId, {
      status: status ?? undefined,
      assignedTo: assignedTo ?? undefined,
    });
    return { tasks };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "tasks:create");
    const input = await parseBody(req, createTaskSchema);
    const task = await createTask(session.familyId, {
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      recurrence: input.recurrence,
      assigneeIds: input.assigneeIds,
      createdBy: session.familyMemberId,
    });
    return { task };
  });
}
