import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import { createTask } from "@/services/tasks";
import { createBill } from "@/services/bills";
import { detectInsights, buildTodaySummary, buildSpokenSummary } from "@/services/insights";

beforeEach(freshDb);

describe("inteligencia proactiva", () => {
  it("detecta una tarea atrasada", async () => {
    const { familyId } = await createTestFamily("insight-task");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 3);
    await createTask(familyId, { title: "Revisar piscina", dueDate: yesterday.toISOString().slice(0, 10) });

    const insights = await detectInsights(familyId);
    expect(insights.some((i) => i.kind === "overdue_task")).toBe(true);
  });

  it("detecta una cuenta próxima a vencer", async () => {
    const { familyId } = await createTestFamily("insight-bill");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await createBill(familyId, {
      name: "Internet",
      amount: 30000,
      dueDate: tomorrow.toISOString().slice(0, 10),
    });

    const insights = await detectInsights(familyId);
    expect(insights.some((i) => i.kind === "bill_due_soon")).toBe(true);
  });

  it("el resumen de 'Familia Hoy' incluye prioridades y conteos coherentes", async () => {
    const { familyId } = await createTestFamily("today");
    await createTask(familyId, { title: "Tarea urgente", priority: "red" });

    const summary = await buildTodaySummary(familyId);
    expect(summary.pendingTasksCount).toBeGreaterThanOrEqual(1);
    expect(summary.greeting).toMatch(/Buenos días|Buenas tardes|Buenas noches/);
  });

  it("genera un resumen hablado de la mañana sin lanzar errores", async () => {
    const { familyId } = await createTestFamily("morning");
    const text = await buildSpokenSummary(familyId, "morning");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("'priorities' de un adulto incluye lo propio, lo sin asignar, Y lo de cualquier hijo (el frontend marca de quién es cada una)", async () => {
    const { familyId, adultId, childId } = await createTestFamily("filtered");
    await createTask(familyId, { title: "Tarea del adulto", assigneeIds: [adultId] });
    await createTask(familyId, { title: "Tarea del niño", assigneeIds: [childId] });
    await createTask(familyId, { title: "Tarea sin asignar" });

    const adultSummary = await buildTodaySummary(familyId, adultId);
    const adultTitles = adultSummary.priorities.map((p) => p.title);
    expect(adultTitles).toContain("Tarea del adulto");
    expect(adultTitles).toContain("Tarea sin asignar");
    expect(adultTitles).toContain("Tarea del niño");
    expect(adultSummary.pendingTasksCount).toBe(3);
  });

  it("el resumen de 'Hoy' de un niño solo muestra lo propio y lo sin asignar, no lo de otro integrante", async () => {
    const { familyId, adultId, childId } = await createTestFamily("filtered-child-view");
    await createTask(familyId, { title: "Tarea del adulto", assigneeIds: [adultId] });
    await createTask(familyId, { title: "Tarea del niño", assigneeIds: [childId] });
    await createTask(familyId, { title: "Tarea sin asignar" });

    const childSummary = await buildTodaySummary(familyId, childId);
    const childTitles = childSummary.priorities.map((p) => p.title);
    expect(childTitles).toContain("Tarea del niño");
    expect(childTitles).toContain("Tarea sin asignar");
    expect(childTitles).not.toContain("Tarea del adulto");
    expect(childSummary.pendingTasksCount).toBe(2);
  });

  it("no genera insights si la inteligencia proactiva está desactivada", async () => {
    const { familyId } = await createTestFamily("disabled");
    const { getDb } = await import("@/db/client");
    const db = await getDb();
    await db.query("UPDATE families SET ai_proactive_enabled = FALSE WHERE id = $1", [familyId]);
    await createTask(familyId, { title: "Atrasada", dueDate: "2000-01-01" });

    const insights = await detectInsights(familyId);
    expect(insights).toHaveLength(0);
  });
});
