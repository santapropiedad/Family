import path from "node:path";
import { migrate } from "./migrate";
import { createFamilyWithAdmin } from "@/services/families";
import { addMember } from "@/services/members";
import { createTask, completeTask } from "@/services/tasks";
import { createEvent } from "@/services/events";
import { createReminder } from "@/services/reminders";
import { createExpense, findCategoryByName, upsertBudget } from "@/services/expenses";
import { addShoppingItem, upsertInventoryOnPurchase } from "@/services/shopping";
import { createMaintenance } from "@/services/maintenance";
import { createBill } from "@/services/bills";
import { createMemory } from "@/services/memories";
import { getDb } from "./client";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoFromNow(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Crea una familia de demostración completa: "Familia Fernández" (Papá, Mamá, Martina, Julián). */
export async function seedDemoFamily(): Promise<{ email: string; password: string }> {
  const email = "demo@familiaplus.cl";
  const password = "FamiliaDemo2026!";

  const { family, member: admin } = await createFamilyWithAdmin({
    familyName: "Familia Fernández (demo)",
    adminName: "Papá",
    email,
    password,
  });
  const mama = await addMember(family.id, { name: "Mamá", role: "admin", color: "#ec4899", avatarEmoji: "👩" });
  const martina = await addMember(family.id, {
    name: "Martina",
    role: "child",
    color: "#f59e0b",
    avatarEmoji: "👧",
    birthDate: "2015-04-12",
  });
  const julian = await addMember(family.id, {
    name: "Julián",
    role: "child",
    color: "#14b8a6",
    avatarEmoji: "👦",
    birthDate: "2018-09-03",
  });
  await addMember(family.id, {
    name: "Matheo",
    role: "child",
    color: "#f97316",
    avatarEmoji: "🧒",
    birthDate: "2021-02-20",
  });

  // Marca la familia como demo
  const db = await getDb();
  await db.query("UPDATE families SET is_demo = TRUE WHERE id = $1", [family.id]);

  // --- Tareas ---
  await createTask(family.id, {
    title: "Pagar electricidad",
    priority: "red",
    dueDate: daysFromNow(1),
    assigneeIds: [admin.id],
    createdBy: admin.id,
  });
  await createTask(family.id, {
    title: "Revisar la piscina",
    priority: "yellow",
    dueDate: daysFromNow(-3),
    assigneeIds: [admin.id],
    createdBy: admin.id,
  });
  await createTask(family.id, {
    title: "Ordenar habitación",
    priority: "green",
    dueDate: daysFromNow(0),
    assigneeIds: [martina.id],
    createdBy: mama.id,
  });
  await createTask(family.id, {
    title: "Preparar mochilas",
    priority: "yellow",
    dueDate: daysFromNow(0),
    assigneeIds: [mama.id],
    createdBy: mama.id,
  });
  await createTask(family.id, {
    title: "Sacar la basura",
    priority: "green",
    dueDate: daysFromNow(0),
    assigneeIds: [julian.id],
    createdBy: mama.id,
  });
  const completed1 = await createTask(family.id, {
    title: "Lavar loza",
    priority: "green",
    assigneeIds: [mama.id],
    createdBy: mama.id,
  });
  await completeTask(family.id, completed1.id);

  // --- Eventos ---
  await createEvent(family.id, {
    title: "Cumpleaños de la tía Paula",
    category: "birthday",
    startAt: isoFromNow(1, 19, 0),
    assigneeIds: [admin.id, mama.id, martina.id, julian.id],
    createdBy: admin.id,
  });
  await createEvent(family.id, {
    title: "Entrenamiento de fútbol de Julián",
    category: "activity",
    startAt: isoFromNow(0, 17, 0),
    assigneeIds: [julian.id],
    createdBy: mama.id,
  });
  await createEvent(family.id, {
    title: "Prueba de matemáticas de Martina",
    category: "school",
    startAt: isoFromNow(2, 9, 0),
    assigneeIds: [martina.id],
    createdBy: mama.id,
  });

  // --- Recordatorios ---
  await createReminder(family.id, {
    title: "Comprar un regalo para la tía Paula",
    remindAt: isoFromNow(0, 18, 0),
    createdBy: admin.id,
  });
  await createReminder(family.id, {
    title: "Pagar internet",
    remindAt: isoFromNow(5, 9, 0),
    recurrence: "monthly",
    createdBy: admin.id,
  });

  // --- Gastos ---
  const alimentacion = await findCategoryByName(family.id, "Alimentación");
  const entretenimiento = await findCategoryByName(family.id, "Entretenimiento");
  const servicios = await findCategoryByName(family.id, "Servicios");
  await createExpense(family.id, {
    amount: 45000,
    categoryId: alimentacion?.id ?? null,
    description: "Supermercado semanal",
    merchant: "Jumbo",
    familyMemberId: mama.id,
    spentAt: daysFromNow(-2),
    createdBy: mama.id,
  });
  await createExpense(family.id, {
    amount: 12990,
    categoryId: entretenimiento?.id ?? null,
    description: "Streaming mensual",
    merchant: "Netflix",
    familyMemberId: admin.id,
    isRecurring: true,
    spentAt: daysFromNow(-10),
    createdBy: admin.id,
  });
  await createExpense(family.id, {
    amount: 38000,
    categoryId: servicios?.id ?? null,
    description: "Internet",
    merchant: "Movistar",
    familyMemberId: admin.id,
    isRecurring: true,
    spentAt: daysFromNow(-15),
    createdBy: admin.id,
  });
  if (alimentacion) await upsertBudget(family.id, alimentacion.id, 250000);
  if (entretenimiento) await upsertBudget(family.id, entretenimiento.id, 30000);

  // --- Inventario + compras ---
  await upsertInventoryOnPurchase(family.id, "Leche", {
    quantityDelta: 2,
    unit: "litros",
    price: 1490,
    categoryId: alimentacion?.id ?? null,
  });
  const db2 = await getDb();
  await db2.query(
    "UPDATE inventory_items SET avg_purchase_frequency_days = 5, last_purchased_at = $2 WHERE family_id = $1 AND name = 'Leche'",
    [family.id, daysFromNow(-4)]
  );
  await addShoppingItem(family.id, { name: "Pan", quantity: 1, unit: "kg", priority: "red", store: "Feria" });
  await addShoppingItem(family.id, {
    name: "Detergente",
    quantity: 1,
    priority: "yellow",
    store: "Supermercado",
  });
  await addShoppingItem(family.id, {
    name: "Pañales talla 4",
    quantity: 1,
    priority: "yellow",
    assignedTo: mama.id,
    store: "Supermercado",
  });
  // Compras recurrentes e importantes: la ronda semanal de supermercado y feria.
  await addShoppingItem(family.id, {
    name: "Verduras y frutas de la semana",
    quantity: 1,
    priority: "red",
    store: "Feria",
  });
  await addShoppingItem(family.id, {
    name: "Carne y pollo",
    quantity: 1,
    priority: "red",
    store: "Supermercado",
  });
  await addShoppingItem(family.id, {
    name: "Artículos de aseo del mes",
    quantity: 1,
    priority: "yellow",
    store: "Supermercado",
  });

  // --- Casa en orden: mantenciones y cuentas ---
  await createMaintenance(family.id, {
    name: "Calefont",
    location: "Cocina",
    frequencyDays: 365,
    nextMaintenanceAt: daysFromNow(20),
    provider: "GasChile",
  });
  await createMaintenance(family.id, {
    name: "Piscina",
    location: "Patio",
    frequencyDays: 14,
    nextMaintenanceAt: daysFromNow(-3),
  });
  await createBill(family.id, {
    name: "Electricidad",
    provider: "Enel",
    amount: 62000,
    dueDate: daysFromNow(1),
    frequency: "monthly",
    categoryId: servicios?.id ?? null,
  });
  await createBill(family.id, {
    name: "Agua",
    provider: "Aguas Andinas",
    amount: 28000,
    dueDate: daysFromNow(12),
    frequency: "monthly",
    categoryId: servicios?.id ?? null,
  });

  // --- Memoria ---
  await createMemory(family.id, {
    type: "permanent",
    category: "preferencia",
    content: "A Martina le gusta el helado de chocolate para sus cumpleaños.",
    relatedFamilyMemberId: martina.id,
    createdBy: "user",
  });
  await createMemory(family.id, {
    type: "temporary",
    category: "evento",
    content: "Esta semana Martina tiene prueba de matemáticas.",
    relatedFamilyMemberId: martina.id,
    expiresAt: isoFromNow(7, 0),
    createdBy: "ai",
  });

  return { email, password };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  migrate()
    .then(() => seedDemoFamily())
    .then(({ email, password }) => {
      console.log("Familia de demostración creada.");
      console.log(`Correo: ${email}`);
      console.log(`Contraseña: ${password}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error generando datos de demostración:", err);
      process.exit(1);
    });
}
