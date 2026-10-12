import { describe, it, expect } from "vitest";
import { alarmPhaseFor, combineDueAt, postponeDue } from "@/lib/taskTime";

describe("alarmPhaseFor", () => {
  const due = new Date(2026, 0, 15, 12, 0, 0); // 15 de enero de 2026, 12:00

  it("avisa 'due_soon' cuando faltan 15 minutos o menos para vencer", () => {
    expect(alarmPhaseFor(due, new Date(2026, 0, 15, 11, 45, 0))).toBe("due_soon");
    expect(alarmPhaseFor(due, new Date(2026, 0, 15, 12, 0, 0))).toBe("due_soon");
  });

  it("no avisa si faltan más de 15 minutos", () => {
    expect(alarmPhaseFor(due, new Date(2026, 0, 15, 11, 30, 0))).toBeNull();
  });

  it("no avisa entre el vencimiento y los 10 minutos de atraso (zona muerta)", () => {
    expect(alarmPhaseFor(due, new Date(2026, 0, 15, 12, 5, 0))).toBeNull();
  });

  it("avisa 'overdue_alarm' desde los 10 minutos de atraso en adelante", () => {
    expect(alarmPhaseFor(due, new Date(2026, 0, 15, 12, 10, 0))).toBe("overdue_alarm");
    expect(alarmPhaseFor(due, new Date(2026, 0, 15, 15, 0, 0))).toBe("overdue_alarm");
  });
});

describe("combineDueAt", () => {
  it("combina fecha y hora (con o sin segundos) en un Date local", () => {
    expect(combineDueAt("2026-01-15", "12:00").getHours()).toBe(12);
    expect(combineDueAt("2026-01-15", "12:00:00").getMinutes()).toBe(0);
  });
});

describe("postponeDue", () => {
  it("postergar antes del vencimiento suma minutos al vencimiento actual", () => {
    const now = new Date(2026, 0, 15, 11, 0, 0);
    const result = postponeDue({ due_date: "2026-01-15", due_time: "12:00" }, 15, now);
    expect(result).toEqual({ dueDate: "2026-01-15", dueTime: "12:15" });
  });

  it("postergar una tarea ya vencida suma minutos a 'ahora', no al vencimiento pasado", () => {
    const now = new Date(2026, 0, 15, 14, 0, 0);
    const result = postponeDue({ due_date: "2026-01-15", due_time: "12:00" }, 15, now);
    expect(result).toEqual({ dueDate: "2026-01-15", dueTime: "14:15" });
  });

  it("una tarea sin vencimiento previo se posterga desde 'ahora'", () => {
    const now = new Date(2026, 0, 15, 9, 0, 0);
    const result = postponeDue({ due_date: null, due_time: null }, 60, now);
    expect(result).toEqual({ dueDate: "2026-01-15", dueTime: "10:00" });
  });
});
