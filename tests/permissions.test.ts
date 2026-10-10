import { describe, it, expect } from "vitest";
import { hasCapability, assertCapability, canActOnOwnRecordOnly } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";

describe("sistema de permisos", () => {
  it("el administrador puede configurar la familia y ver finanzas", () => {
    expect(hasCapability("admin", "family:configure")).toBe(true);
    expect(hasCapability("admin", "finances:view")).toBe(true);
    expect(hasCapability("admin", "data:admin")).toBe(true);
  });

  it("el adulto puede gestionar tareas y gastos pero no configurar la familia", () => {
    expect(hasCapability("adult", "tasks:create")).toBe(true);
    expect(hasCapability("adult", "finances:manage")).toBe(true);
    expect(hasCapability("adult", "family:configure")).toBe(false);
    expect(hasCapability("adult", "data:admin")).toBe(false);
  });

  it("el niño solo puede usar la IA y gestionar sus propias tareas", () => {
    expect(hasCapability("child", "ai:use")).toBe(true);
    expect(hasCapability("child", "tasks:manage_own")).toBe(true);
    expect(hasCapability("child", "finances:view")).toBe(false);
    expect(hasCapability("child", "tasks:manage_any")).toBe(false);
    expect(hasCapability("child", "family:manage_members")).toBe(false);
  });

  it("assertCapability lanza ForbiddenError cuando no corresponde", () => {
    expect(() => assertCapability("child", "finances:manage")).toThrow(ForbiddenError);
    expect(() => assertCapability("admin", "finances:manage")).not.toThrow();
  });

  it("solo los niños están restringidos a sus propios registros", () => {
    expect(canActOnOwnRecordOnly("child")).toBe(true);
    expect(canActOnOwnRecordOnly("adult")).toBe(false);
    expect(canActOnOwnRecordOnly("admin")).toBe(false);
  });
});
