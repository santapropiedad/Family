import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import { createTask, listTasks, getTask } from "@/services/tasks";
import { createExpense, listExpenses } from "@/services/expenses";
import { listMembers } from "@/services/members";
import { NotFoundError } from "@/lib/errors";

beforeEach(freshDb);

describe("aislamiento entre familias", () => {
  it("una familia no puede ver las tareas de otra", async () => {
    const familyA = await createTestFamily("A");
    const familyB = await createTestFamily("B");

    await createTask(familyA.familyId, { title: "Tarea de A", createdBy: familyA.adminId });
    await createTask(familyB.familyId, { title: "Tarea de B", createdBy: familyB.adminId });

    const tasksA = await listTasks(familyA.familyId);
    const tasksB = await listTasks(familyB.familyId);

    expect(tasksA).toHaveLength(1);
    expect(tasksA[0].title).toBe("Tarea de A");
    expect(tasksB).toHaveLength(1);
    expect(tasksB[0].title).toBe("Tarea de B");
  });

  it("no se puede leer una tarea de otra familia aunque se tenga su ID", async () => {
    const familyA = await createTestFamily("A2");
    const familyB = await createTestFamily("B2");
    const task = await createTask(familyA.familyId, { title: "Privada", createdBy: familyA.adminId });

    await expect(getTask(familyB.familyId, task.id)).rejects.toThrow(NotFoundError);
  });

  it("los gastos están completamente aislados por familia", async () => {
    const familyA = await createTestFamily("A3");
    const familyB = await createTestFamily("B3");

    await createExpense(familyA.familyId, { amount: 1000, createdBy: familyA.adminId });
    const expensesB = await listExpenses(familyB.familyId);
    expect(expensesB).toHaveLength(0);
  });

  it("los integrantes de una familia no aparecen en otra", async () => {
    const familyA = await createTestFamily("A4");
    const familyB = await createTestFamily("B4");
    const membersA = await listMembers(familyA.familyId);
    const membersB = await listMembers(familyB.familyId);
    expect(membersA.every((m) => m.family_id === familyA.familyId)).toBe(true);
    expect(membersB.every((m) => m.family_id === familyB.familyId)).toBe(true);
    expect(membersA.map((m) => m.id)).not.toEqual(expect.arrayContaining(membersB.map((m) => m.id)));
  });
});
