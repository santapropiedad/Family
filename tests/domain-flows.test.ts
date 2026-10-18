import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import {
  addShoppingItem,
  findInventoryItemByName,
  listShoppingItems,
  recordPurchase,
  updateShoppingItem,
} from "@/services/shopping";
import { createExpense, listExpenses, updateExpense, deleteExpense } from "@/services/expenses";
import { createEvent, findConflicts } from "@/services/events";
import { createMaintenance, completeMaintenance } from "@/services/maintenance";
import { createBill, payBill, listBills } from "@/services/bills";
import { createMemory, listMemories, clearAllMemories } from "@/services/memories";

beforeEach(freshDb);

describe("flujo conectado: compras, inventario y gastos", () => {
  it("'Compré leche por $8.990' registra el gasto, actualiza inventario y quita el pendiente de la lista", async () => {
    const { familyId } = await createTestFamily();
    await addShoppingItem(familyId, { name: "Leche", quantity: 1, unit: "litros" });

    const before = await listShoppingItems(familyId, "pending");
    expect(before.some((i) => i.name === "Leche")).toBe(true);

    await recordPurchase(familyId, { itemName: "Leche", amount: 8990 });

    const pendingAfter = await listShoppingItems(familyId, "pending");
    expect(pendingAfter.some((i) => i.name === "Leche")).toBe(false);

    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(1);
    expect(Number(expenses[0].amount)).toBe(8990);

    const inventory = await findInventoryItemByName(familyId, "Leche");
    expect(inventory).not.toBeNull();
    expect(Number(inventory?.current_quantity)).toBe(1);
    expect(Number(inventory?.last_price)).toBe(8990);
  });

  it("registra una compra que no estaba en la lista sin romper nada", async () => {
    const { familyId } = await createTestFamily("sin-lista");
    const { removedFromShoppingList } = await recordPurchase(familyId, { itemName: "Pan", amount: 2000 });
    expect(removedFromShoppingList).toBe(false);
    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(1);
  });

  it("editar solo el nombre de un ítem no borra su cantidad ni su prioridad (regresión)", async () => {
    const { familyId } = await createTestFamily("edit-item");
    const item = await addShoppingItem(familyId, { name: "Carne y pollo", quantity: 2, priority: "red" });

    // Simula lo que hace la ruta PATCH: un objeto con todas las claves posibles,
    // donde las no enviadas por el cliente quedan en `undefined`.
    const updated = await updateShoppingItem(familyId, item.id, {
      name: "Carne, pollo y pescado",
      quantity: undefined,
      unit: undefined,
      priority: undefined,
      assigned_to: undefined,
      store: undefined,
    });

    expect(updated.name).toBe("Carne, pollo y pescado");
    expect(Number(updated.quantity)).toBe(2);
    expect(updated.priority).toBe("red");
  });

  it("edita el monto y la descripción de un gasto ya registrado", async () => {
    const { familyId } = await createTestFamily("edit-expense");
    const expense = await createExpense(familyId, { amount: 100000, description: "Supermercado" });

    const updated = await updateExpense(familyId, expense.id, { amount: 85000, description: "Supermercado semanal" });

    expect(Number(updated.amount)).toBe(85000);
    expect(updated.description).toBe("Supermercado semanal");
  });

  it("editar solo el monto de un gasto no borra su descripción (regresión)", async () => {
    const { familyId } = await createTestFamily("edit-expense-partial");
    const expense = await createExpense(familyId, { amount: 100000, description: "Supermercado" });

    // Simula lo que hace la ruta PATCH: un objeto con todas las claves posibles,
    // donde las no enviadas por el cliente quedan en `undefined`.
    const updated = await updateExpense(familyId, expense.id, {
      amount: 90000,
      description: undefined,
      categoryId: undefined,
      merchant: undefined,
    });

    expect(Number(updated.amount)).toBe(90000);
    expect(updated.description).toBe("Supermercado");
  });

  it("elimina un gasto registrado", async () => {
    const { familyId } = await createTestFamily("delete-expense");
    const expense = await createExpense(familyId, { amount: 5000, description: "Pan" });

    await deleteExpense(familyId, expense.id);

    const remaining = await listExpenses(familyId);
    expect(remaining.find((e) => e.id === expense.id)).toBeUndefined();
  });
});

describe("calendario: detección de conflictos", () => {
  it("detecta cuando dos actividades del mismo integrante se cruzan de horario", async () => {
    const { familyId, adultId } = await createTestFamily("cal");
    const start = new Date().toISOString();
    await createEvent(familyId, { title: "Reunión", startAt: start, assigneeIds: [adultId] });

    const conflicts = await findConflicts(familyId, [adultId], start, null);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].title).toBe("Reunión");
  });

  it("createEvent devuelve los conflictos detectados al crear el segundo evento", async () => {
    const { familyId, adultId } = await createTestFamily("cal2");
    const start = new Date().toISOString();
    await createEvent(familyId, { title: "Actividad 1", startAt: start, assigneeIds: [adultId] });
    const { conflicts } = await createEvent(familyId, {
      title: "Actividad 2",
      startAt: start,
      assigneeIds: [adultId],
    });
    expect(conflicts).toHaveLength(1);
  });
});

describe("casa en orden: mantenciones y cuentas", () => {
  it("al completar una mantención calcula la próxima según la frecuencia", async () => {
    const { familyId } = await createTestFamily("mant");
    const created = await createMaintenance(familyId, { name: "Calefont", frequencyDays: 30 });
    const completed = await completeMaintenance(familyId, created.id);
    expect(completed.last_maintenance_at).not.toBeNull();
    expect(completed.next_maintenance_at).not.toBeNull();
  });

  it("pagar una cuenta mensual crea el gasto y programa la próxima cuenta", async () => {
    const { familyId } = await createTestFamily("bill");
    const bill = await createBill(familyId, {
      name: "Luz",
      amount: 50000,
      dueDate: new Date().toISOString().slice(0, 10),
      frequency: "monthly",
    });
    await payBill(familyId, bill.id);

    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(1);
    expect(Number(expenses[0].amount)).toBe(50000);

    const bills = await listBills(familyId);
    const pending = bills.filter((b) => b.status === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].due_date).not.toBe(bill.due_date);
  });

  it("una cuenta 'once' no genera una próxima cuenta al pagarse", async () => {
    const { familyId } = await createTestFamily("bill-once");
    const bill = await createBill(familyId, {
      name: "Multa única",
      amount: 10000,
      dueDate: new Date().toISOString().slice(0, 10),
      frequency: "once",
    });
    await payBill(familyId, bill.id);
    const bills = await listBills(familyId);
    expect(bills).toHaveLength(1);
    expect(bills[0].status).toBe("paid");
  });
});

describe("memoria de familia+", () => {
  it("permite crear, listar y borrar toda la memoria", async () => {
    const { familyId } = await createTestFamily("mem");
    await createMemory(familyId, { type: "permanent", content: "Dato importante", createdBy: "user" });
    await createMemory(familyId, { type: "temporary", content: "Dato temporal", createdBy: "ai" });

    const memories = await listMemories(familyId);
    expect(memories).toHaveLength(2);

    await clearAllMemories(familyId);
    expect(await listMemories(familyId)).toHaveLength(0);
  });
});
