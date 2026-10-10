import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { Priority, Recurrence, Source, Task } from "@/types/domain";

async function withAssignees(familyId: string, tasks: Task[]): Promise<Task[]> {
  if (tasks.length === 0) return tasks;
  const db = await getDb();
  const ids = tasks.map((t) => t.id);
  const result = await db.query<{ task_id: string; family_member_id: string }>(
    `SELECT task_id, family_member_id FROM task_assignments WHERE task_id = ANY($1::uuid[])`,
    [ids]
  );
  const byTask = new Map<string, string[]>();
  for (const row of result.rows) {
    const list = byTask.get(row.task_id) ?? [];
    list.push(row.family_member_id);
    byTask.set(row.task_id, list);
  }
  return tasks.map((t) => ({ ...t, assignees: byTask.get(t.id) ?? [] }));
}

export interface TaskFilters {
  status?: Task["status"];
  assignedTo?: string;
  dueBefore?: string;
  dueOn?: string;
}

export async function listTasks(familyId: string, filters: TaskFilters = {}): Promise<Task[]> {
  const db = await getDb();
  const conditions = ["t.family_id = $1"];
  const values: unknown[] = [familyId];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (filters.dueBefore) {
    values.push(filters.dueBefore);
    conditions.push(`t.due_date <= $${values.length}`);
  }
  if (filters.dueOn) {
    values.push(filters.dueOn);
    conditions.push(`t.due_date = $${values.length}`);
  }
  if (filters.assignedTo) {
    values.push(filters.assignedTo);
    conditions.push(
      `EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.family_member_id = $${values.length})`
    );
  }

  const result = await db.query<Task>(
    `SELECT t.* FROM tasks t WHERE ${conditions.join(" AND ")}
     ORDER BY (t.priority = 'red') DESC, t.due_date ASC NULLS LAST, t.created_at DESC`,
    values
  );
  return withAssignees(familyId, result.rows);
}

export async function getTask(familyId: string, taskId: string): Promise<Task> {
  const db = await getDb();
  const result = await db.query<Task>("SELECT * FROM tasks WHERE family_id = $1 AND id = $2", [
    familyId,
    taskId,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Tarea no encontrada.");
  const [withAssignee] = await withAssignees(familyId, result.rows);
  return withAssignee;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: Recurrence;
  assigneeIds?: string[];
  source?: Source;
  createdBy?: string | null;
}

export async function createTask(familyId: string, input: CreateTaskInput): Promise<Task> {
  const db = await getDb();
  const taskId = newId();
  await db.query(
    `INSERT INTO tasks (id, family_id, title, description, priority, due_date, due_time, recurrence, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      taskId,
      familyId,
      input.title.trim(),
      input.description ?? null,
      input.priority ?? "yellow",
      input.dueDate ?? null,
      input.dueTime ?? null,
      input.recurrence ?? "none",
      input.source ?? "manual",
      input.createdBy ?? null,
    ]
  );
  for (const memberId of input.assigneeIds ?? []) {
    await db.query(
      `INSERT INTO task_assignments (id, task_id, family_member_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [newId(), taskId, memberId]
    );
  }
  return getTask(familyId, taskId);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: Recurrence;
  status?: Task["status"];
  assigneeIds?: string[];
}

export async function updateTask(familyId: string, taskId: string, input: UpdateTaskInput): Promise<Task> {
  await getTask(familyId, taskId);
  const db = await getDb();

  const columnMap: Record<string, unknown> = {};
  if (input.title !== undefined) columnMap.title = input.title.trim();
  if (input.description !== undefined) columnMap.description = input.description;
  if (input.priority !== undefined) columnMap.priority = input.priority;
  if (input.dueDate !== undefined) columnMap.due_date = input.dueDate;
  if (input.dueTime !== undefined) columnMap.due_time = input.dueTime;
  if (input.recurrence !== undefined) columnMap.recurrence = input.recurrence;
  if (input.status !== undefined) {
    columnMap.status = input.status;
    columnMap.completed_at = input.status === "completed" ? new Date().toISOString() : null;
  }

  const fields = Object.keys(columnMap);
  if (fields.length > 0) {
    const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
    const values = fields.map((field) => columnMap[field]);
    await db.query(
      `UPDATE tasks SET ${setClauses.join(", ")}, updated_at = now() WHERE family_id = $1 AND id = $2`,
      [familyId, taskId, ...values]
    );
  }

  if (input.assigneeIds !== undefined) {
    await db.query("DELETE FROM task_assignments WHERE task_id = $1", [taskId]);
    for (const memberId of input.assigneeIds) {
      await db.query(
        `INSERT INTO task_assignments (id, task_id, family_member_id) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [newId(), taskId, memberId]
      );
    }
  }

  return getTask(familyId, taskId);
}

export async function completeTask(familyId: string, taskId: string): Promise<Task> {
  return updateTask(familyId, taskId, { status: "completed" });
}

export async function deleteTask(familyId: string, taskId: string): Promise<void> {
  await getTask(familyId, taskId);
  const db = await getDb();
  await db.query("DELETE FROM tasks WHERE family_id = $1 AND id = $2", [familyId, taskId]);
}
