import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import {
  checkTaskAlarms,
  checkAndPushTaskAlarms,
  checkAllFamiliesTaskAlarms,
  listFamilyIdsWithTimedPendingTasks,
} from "@/services/alarms";
import { createTask, completeTask } from "@/services/tasks";
import { listNotifications } from "@/services/notifications";
import { isPushConfigured } from "@/services/push";

beforeEach(freshDb);

describe("sistema de avisos de tareas", () => {
  it("avisa 15 minutos antes del vencimiento", async () => {
    const { familyId, adultId } = await createTestFamily("alarm-soon");
    await createTask(familyId, {
      title: "Sacar las galletas del horno",
      dueDate: "2026-01-15",
      dueTime: "12:00",
      assigneeIds: [adultId],
    });

    const now = new Date(2026, 0, 15, 11, 50, 0);
    const created = await checkTaskAlarms(familyId, now);

    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("task_due_soon");
    expect(created[0].related_entity_id).toBeDefined();
    expect(created[0].family_member_id).toBe(adultId);
  });

  it("avisa 10 minutos después si la tarea sigue sin completarse", async () => {
    const { familyId, adultId } = await createTestFamily("alarm-overdue");
    await createTask(familyId, {
      title: "Pagar la cuenta",
      dueDate: "2026-01-15",
      dueTime: "12:00",
      assigneeIds: [adultId],
    });

    const now = new Date(2026, 0, 15, 12, 15, 0);
    const created = await checkTaskAlarms(familyId, now);

    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("task_overdue_alarm");
    expect(created[0].priority).toBe("high");
  });

  it("no avisa si la tarea ya está completada", async () => {
    const { familyId, adultId } = await createTestFamily("alarm-done");
    const task = await createTask(familyId, {
      title: "Regar las plantas",
      dueDate: "2026-01-15",
      dueTime: "12:00",
      assigneeIds: [adultId],
    });
    await completeTask(familyId, task.id);

    const created = await checkTaskAlarms(familyId, new Date(2026, 0, 15, 12, 20, 0));
    expect(created).toHaveLength(0);
  });

  it("no avisa fuera de las dos ventanas (ni mucho antes, ni en la zona muerta)", async () => {
    const { familyId } = await createTestFamily("alarm-none");
    await createTask(familyId, { title: "Tarea lejana", dueDate: "2026-01-15", dueTime: "12:00" });

    expect(await checkTaskAlarms(familyId, new Date(2026, 0, 15, 10, 0, 0))).toHaveLength(0);
    expect(await checkTaskAlarms(familyId, new Date(2026, 0, 15, 12, 5, 0))).toHaveLength(0);
  });

  it("ignora tareas sin hora de vencimiento (solo fecha)", async () => {
    const { familyId } = await createTestFamily("alarm-no-time");
    await createTask(familyId, { title: "Sin hora", dueDate: "2026-01-15" });
    const created = await checkTaskAlarms(familyId, new Date(2026, 0, 15, 12, 10, 0));
    expect(created).toHaveLength(0);
  });

  it("no duplica avisos si se consulta varias veces seguidas (polling)", async () => {
    const { familyId, adultId } = await createTestFamily("alarm-dedup");
    await createTask(familyId, {
      title: "Llevar a Martina al colegio",
      dueDate: "2026-01-15",
      dueTime: "12:00",
      assigneeIds: [adultId],
    });

    const now = new Date(2026, 0, 15, 11, 50, 0);
    const first = await checkTaskAlarms(familyId, now);
    const second = await checkTaskAlarms(familyId, new Date(now.getTime() + 60_000));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    const all = await listNotifications(familyId, adultId);
    expect(all.filter((n) => n.type === "task_due_soon")).toHaveLength(1);
  });

  it("una tarea con varios responsables genera un aviso para toda la familia (sin destinatario único)", async () => {
    const { familyId, adultId, childId } = await createTestFamily("alarm-multi");
    await createTask(familyId, {
      title: "Preparar la once",
      dueDate: "2026-01-15",
      dueTime: "12:00",
      assigneeIds: [adultId, childId],
    });

    const created = await checkTaskAlarms(familyId, new Date(2026, 0, 15, 11, 55, 0));
    expect(created).toHaveLength(1);
    expect(created[0].family_member_id).toBeNull();
  });
});

describe("avisos push para cuando la app está cerrada (cron)", () => {
  it("sin VAPID configurado, el entorno de pruebas no intenta enviar push de verdad", () => {
    expect(isPushConfigured()).toBe(false);
  });

  it("checkAndPushTaskAlarms crea los mismos avisos que checkTaskAlarms (push deshabilitado en pruebas)", async () => {
    const { familyId, adultId } = await createTestFamily("alarm-push");
    await createTask(familyId, {
      title: "Sacar las galletas del horno",
      dueDate: "2026-01-15",
      dueTime: "12:00",
      assigneeIds: [adultId],
    });

    const created = await checkAndPushTaskAlarms(familyId, new Date(2026, 0, 15, 11, 50, 0));
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("task_due_soon");
  });

  it("lista solo familias con tareas pendientes que tienen fecha Y hora", async () => {
    const { familyId: conHora } = await createTestFamily("timed-yes");
    await createTask(conHora, { title: "Con hora", dueDate: "2026-01-15", dueTime: "12:00" });

    const { familyId: sinHora } = await createTestFamily("timed-no");
    await createTask(sinHora, { title: "Sin hora", dueDate: "2026-01-15" });

    const ids = await listFamilyIdsWithTimedPendingTasks();
    expect(ids).toContain(conHora);
    expect(ids).not.toContain(sinHora);
  });

  it("checkAllFamiliesTaskAlarms revisa varias familias en una sola pasada", async () => {
    const { familyId: f1, adultId: a1 } = await createTestFamily("cron-f1");
    await createTask(f1, { title: "Tarea familia 1", dueDate: "2026-01-15", dueTime: "12:00", assigneeIds: [a1] });

    const { familyId: f2, adultId: a2 } = await createTestFamily("cron-f2");
    await createTask(f2, { title: "Tarea familia 2", dueDate: "2026-01-15", dueTime: "12:05", assigneeIds: [a2] });

    const total = await checkAllFamiliesTaskAlarms(new Date(2026, 0, 15, 11, 55, 0));
    expect(total).toBe(2);

    // Repetir en el mismo instante no debe volver a contar (dedup de createNotification).
    const totalOtraVez = await checkAllFamiliesTaskAlarms(new Date(2026, 0, 15, 11, 56, 0));
    expect(totalOtraVez).toBe(0);
  });
});
