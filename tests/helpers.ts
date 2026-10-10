import { resetDbForTests } from "@/db/client";
import { migrate } from "@/db/migrate";
import { createFamilyWithAdmin } from "@/services/families";
import { addMember } from "@/services/members";
import type { Role } from "@/lib/permissions";

/** Fresh in-memory PGlite database with the schema applied, isolated per test. */
export async function freshDb(): Promise<void> {
  await resetDbForTests();
  await migrate();
}

export interface TestFamily {
  familyId: string;
  adminId: string;
  adultId: string;
  childId: string;
}

/** Creates a minimal family with one of each role, for permission/isolation tests. */
export async function createTestFamily(suffix = ""): Promise<TestFamily> {
  const { family, member: admin } = await createFamilyWithAdmin({
    familyName: `Familia de prueba ${suffix}`,
    adminName: "Admin",
    email: `admin${suffix}@test.local`,
    password: "password123",
  });
  const adult = await addMember(family.id, { name: "Adulto", role: "adult" as Role });
  const child = await addMember(family.id, { name: "Niño", role: "child" as Role });
  return { familyId: family.id, adminId: admin.id, adultId: adult.id, childId: child.id };
}
