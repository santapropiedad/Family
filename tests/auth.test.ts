import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "./helpers";
import { hashPassword, verifyPassword, signSession, verifySession } from "@/lib/auth";
import { createFamilyWithAdmin } from "@/services/families";
import { findUserByEmail } from "@/services/members";
import { AppError } from "@/lib/errors";

beforeEach(freshDb);

describe("autenticación", () => {
  it("hashea y verifica contraseñas correctamente", async () => {
    const hash = await hashPassword("miPassword123");
    expect(hash).not.toBe("miPassword123");
    expect(await verifyPassword("miPassword123", hash)).toBe(true);
    expect(await verifyPassword("incorrecta", hash)).toBe(false);
  });

  it("firma y verifica un JWT de sesión", () => {
    const token = signSession({
      userId: "u1",
      familyMemberId: "m1",
      familyId: "f1",
      role: "admin",
      name: "Papá",
    });
    const payload = verifySession(token);
    expect(payload.familyId).toBe("f1");
    expect(payload.role).toBe("admin");
  });

  it("rechaza un token inválido", () => {
    expect(() => verifySession("token-invalido")).toThrow();
  });

  it("registra una familia y permite encontrar el usuario por correo", async () => {
    await createFamilyWithAdmin({
      familyName: "Familia Test",
      adminName: "Admin",
      email: "test@correo.cl",
      password: "password123",
    });
    const user = await findUserByEmail("TEST@correo.cl");
    expect(user).not.toBeNull();
    expect(user?.role).toBe("admin");
    expect(user?.name).toBe("Admin");
  });

  it("no permite registrar dos familias con el mismo correo", async () => {
    const input = {
      familyName: "Familia Uno",
      adminName: "Admin",
      email: "duplicado@correo.cl",
      password: "password123",
    };
    await createFamilyWithAdmin(input);
    await expect(createFamilyWithAdmin({ ...input, familyName: "Familia Dos" })).rejects.toThrow(AppError);
  });
});
