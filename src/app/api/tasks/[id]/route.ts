import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability, canActOnOwnRecordOnly } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { deleteTask, getTask, updateTask } from "@/services/tasks";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["red", "yellow", "green"]).optional(),
  dueDate: z.string().trim().max(10).nullable().optional(),
  dueTime: z.string().trim().max(8).nullable().optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  status: z.enum(["pending", "completed", "cancelled"]).optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

async function assertCanManage(session: { role: "admin" | "adult" | "child"; familyMemberId: string }, familyId: string, taskId: string) {
  if (canActOnOwnRecordOnly(session.role)) {
    const task = await getTask(familyId, taskId);
    if (!task.assignees?.includes(session.familyMemberId)) {
      throw new ForbiddenError("Solo puedes modificar tus propias tareas.");
    }
    return;
  }
  assertCapability(session.role, "tasks:manage_any");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { id } = await params;
    await assertCanManage(session, session.familyId, id);
    const input = await parseBody(req, patchSchema);
    const task = await updateTask(session.familyId, id, input);
    return { task };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await requireSession();
    const { id } = await params;
    assertCapability(session.role, "tasks:manage_any");
    await deleteTask(session.familyId, id);
    return { deleted: true };
  });
}
