import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "./helpers";
import { hashPassword, verifyPassword, signSession, verifySession } from "@/lib/auth";
import { createFamilyWithAdmin } from "@/services/families";
import { findUserByEmail, updateCredentials, setMemberLogin, addMember } from "@/services/members";
import { AppError, AuthError } from "@/lib/errors";

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

describe("cambiar mis propias credenciales de acceso", () => {
  it("cambia el correo y la contraseña con la contraseña actual correcta", async () => {
    const { user } = await createFamilyWithAdmin({
      familyName: "Familia Credenciales",
      adminName: "Admin",
      email: "viejo@correo.cl",
      password: "password123",
    });

    await updateCredentials(user.id, {
      currentPassword: "password123",
      newEmail: "nuevo@correo.cl",
      newPassword: "otraPassword456",
    });

    expect(await findUserByEmail("viejo@correo.cl")).toBeNull();
    const updated = await findUserByEmail("nuevo@correo.cl");
    expect(updated).not.toBeNull();
    expect(await verifyPassword("otraPassword456", updated!.password_hash)).toBe(true);
    expect(await verifyPassword("password123", updated!.password_hash)).toBe(false);
  });

  it("rechaza el cambio si la contraseña actual es incorrecta", async () => {
    const { user } = await createFamilyWithAdmin({
      familyName: "Familia Credenciales Mal",
      adminName: "Admin",
      email: "seguro@correo.cl",
      password: "password123",
    });

    await expect(
      updateCredentials(user.id, { currentPassword: "incorrecta", newPassword: "nuevaPassword456" })
    ).rejects.toThrow(AuthError);

    const stillSame = await findUserByEmail("seguro@correo.cl");
    expect(await verifyPassword("password123", stillSame!.password_hash)).toBe(true);
  });

  it("rechaza cambiar el correo a uno que ya está en uso por otra cuenta", async () => {
    await createFamilyWithAdmin({
      familyName: "Familia Uno",
      adminName: "Admin",
      email: "ocupado@correo.cl",
      password: "password123",
    });
    const { user: segundo } = await createFamilyWithAdmin({
      familyName: "Familia Dos",
      adminName: "Admin",
      email: "libre@correo.cl",
      password: "password123",
    });

    await expect(
      updateCredentials(segundo.id, { currentPassword: "password123", newEmail: "ocupado@correo.cl" })
    ).rejects.toThrow(AppError);
  });
});

describe("un administrador da o cambia el acceso de otro integrante", () => {
  it("crea una cuenta nueva para un integrante que nunca tuvo login", async () => {
    const { family } = await createFamilyWithAdmin({
      familyName: "Familia Acceso",
      adminName: "Admin",
      email: "admin-acceso@correo.cl",
      password: "password123",
    });
    const mama = await addMember(family.id, { name: "Mamá", role: "admin" });
    expect(await findUserByEmail("teany12@hotmail.com")).toBeNull();

    await setMemberLogin(family.id, mama.id, { email: "teany12@hotmail.com", password: "temporal123" });

    const created = await findUserByEmail("teany12@hotmail.com");
    expect(created).not.toBeNull();
    expect(created?.name).toBe("Mamá");
    expect(await verifyPassword("temporal123", created!.password_hash)).toBe(true);
  });

  it("exige correo Y contraseña para crear la primera cuenta de alguien", async () => {
    const { family } = await createFamilyWithAdmin({
      familyName: "Familia Acceso Incompleto",
      adminName: "Admin",
      email: "admin-incompleto@correo.cl",
      password: "password123",
    });
    const hijo = await addMember(family.id, { name: "Hijo", role: "child" });
    await expect(setMemberLogin(family.id, hijo.id, { email: "hijo@correo.cl" })).rejects.toThrow(AppError);
  });

  it("cambia solo el correo de alguien que ya tiene cuenta, sin tocar su contraseña", async () => {
    const { family, user } = await createFamilyWithAdmin({
      familyName: "Familia Solo Correo",
      adminName: "Papá",
      email: "papa-viejo@correo.cl",
      password: "claveOriginal1",
    });

    await setMemberLogin(family.id, user.family_member_id, { email: "jufernandez@gmail.com" });

    expect(await findUserByEmail("papa-viejo@correo.cl")).toBeNull();
    const updated = await findUserByEmail("jufernandez@gmail.com");
    expect(updated).not.toBeNull();
    expect(await verifyPassword("claveOriginal1", updated!.password_hash)).toBe(true);
  });
});
