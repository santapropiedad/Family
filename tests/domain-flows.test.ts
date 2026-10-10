import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import { addShoppingItem, findInventoryItemByName, listShoppingItems, recordPurchase } from "@/services/shopping";
import { listExpenses } from "@/services/expenses";
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
