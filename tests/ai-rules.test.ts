import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import { handleWithRules } from "@/ai/rules";
import { listExpenses } from "@/services/expenses";
import { listShoppingItems, upsertInventoryOnPurchase } from "@/services/shopping";
import { createTask, listTasks } from "@/services/tasks";
import { listEvents } from "@/services/events";
import { parseAmount, parseQuantityItem, parseRelativeDate, parseTimeOfDay } from "@/ai/parsing";

beforeEach(freshDb);

describe("parsing de lenguaje natural (modo reglas)", () => {
  it("extrae montos en distintos formatos", () => {
    expect(parseAmount("$8.990")).toBe(8990);
    expect(parseAmount("20 mil pesos")).toBe(20000);
    expect(parseAmount("15000")).toBe(15000);
  });

  it("extrae cantidad, unidad y nombre de producto", () => {
    expect(parseQuantityItem("tres kilos de arroz")).toEqual({ quantity: 3, unit: "kilos", name: "arroz" });
    expect(parseQuantityItem("2 litros de leche")).toEqual({ quantity: 2, unit: "litros", name: "leche" });
  });

  it("resuelve fechas relativas", () => {
    const now = new Date(2026, 0, 15); // jueves 15 de enero de 2026
    expect(parseRelativeDate("mañana", now)).toBe("2026-01-16");
    expect(parseRelativeDate("hoy", now)).toBe("2026-01-15");
  });

  it("no confunde 'de la mañana' (hora del día) con 'mañana' (día siguiente) al elegir la fecha (regresión)", () => {
    const now = new Date(2026, 0, 15); // jueves 15 de enero de 2026
    const tomorrow = parseRelativeDate("mañana", now);
    const saturdayAlone = parseRelativeDate("sábado", now);
    const saturdayWithTime = parseRelativeDate("el sábado a las diez de la mañana", now);
    expect(saturdayWithTime).toBe(saturdayAlone);
    expect(saturdayWithTime).not.toBe(tomorrow);
  });

  it("extrae la hora de frases en lenguaje natural", () => {
    expect(parseTimeOfDay("a las diez de la mañana")).toBe("10:00:00");
    expect(parseTimeOfDay("a las 3 de la tarde")).toBe("15:00:00");
    expect(parseTimeOfDay("a las 10:30")).toBe("10:30:00");
    expect(parseTimeOfDay("sin hora mencionada")).toBeNull();
  });
});

describe("motor de reglas (sin ANTHROPIC_API_KEY)", () => {
  it("'Compré leche por $8.990' registra el gasto conectado", async () => {
    const { familyId, adultId } = await createTestFamily("rules-buy");
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Compré leche por $8.990",
      null
    );
    expect(reply).toMatch(/leche/i);
    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(1);
  });

  it("'Agrega tres kilos de arroz' agrega el producto correcto a la lista", async () => {
    const { familyId, adultId } = await createTestFamily("rules-add");
    await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Agrega tres kilos de arroz",
      null
    );
    const items = await listShoppingItems(familyId, "pending");
    expect(items.some((i) => i.name.toLowerCase() === "arroz" && Number(i.quantity) === 3)).toBe(true);
  });

  it("'Agrega dos litros de leche a la lista del supermercado' no incluye el remate en el nombre y asigna la tienda (regresión)", async () => {
    const { familyId, adultId } = await createTestFamily("rules-add-store");
    await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Agrega dos litros de leche a la lista del supermercado",
      null
    );
    const items = await listShoppingItems(familyId, "pending");
    const leche = items.find((i) => i.name.toLowerCase() === "leche");
    expect(leche).toBeDefined();
    expect(Number(leche!.quantity)).toBe(2);
    expect(leche!.store).toBe("Supermercado");
  });

  it("'Agrega pan a la feria' asigna la tienda Feria", async () => {
    const { familyId, adultId } = await createTestFamily("rules-add-feria");
    await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Agrega pan a la feria",
      null
    );
    const items = await listShoppingItems(familyId, "pending");
    const pan = items.find((i) => i.name.toLowerCase() === "pan");
    expect(pan).toBeDefined();
    expect(pan!.store).toBe("Feria");
  });

  it("'Crea una tarea para limpiar la cocina' crea una tarea genérica sin asignar", async () => {
    const { familyId, adultId } = await createTestFamily("rules-create-task");
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Crea una tarea para limpiar la cocina",
      null
    );
    expect(reply).toMatch(/limpiar la cocina/i);
    const tasks = await listTasks(familyId, { status: "pending" });
    expect(tasks.some((t) => t.title.toLowerCase().includes("limpiar la cocina"))).toBe(true);
  });

  it("'Marca como completada la tarea de sacar la basura' encuentra la tarea por nombre y la completa", async () => {
    const { familyId, adultId } = await createTestFamily("rules-complete-task");
    await createTask(familyId, { title: "Sacar la basura" });
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Marca como completada la tarea de sacar la basura",
      null
    );
    expect(reply).toMatch(/sacar la basura/i);
    const pending = await listTasks(familyId, { status: "pending" });
    expect(pending.some((t) => t.title === "Sacar la basura")).toBe(false);
  });

  it("'¿Cuánta leche queda?' responde con la cantidad y unidad reales del inventario", async () => {
    const { familyId, adultId } = await createTestFamily("rules-stock");
    await upsertInventoryOnPurchase(familyId, "Leche", { quantityDelta: 3, unit: "litros" });
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "¿Cuánta leche queda?",
      null
    );
    expect(reply).toMatch(/3 litros de Leche/);
  });

  it("'Registra un gasto de 5.000 pesos en transporte' (imperativo) registra el gasto categorizado", async () => {
    const { familyId, adultId } = await createTestFamily("rules-imperative-expense");
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Registra un gasto de 5.000 pesos en transporte",
      null
    );
    expect(reply).toMatch(/\$5\.000/);
    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(1);
    expect(Number(expenses[0].amount)).toBe(5000);
  });

  it("un gasto imperativo sobre el umbral pide confirmación en vez de registrarse directo", async () => {
    const { familyId, adultId } = await createTestFamily("rules-imperative-confirm");
    const { reply, action } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Registra un gasto de 50.000 pesos en transporte",
      null
    );
    expect(action?.status).toBe("pending_confirmation");
    expect(reply).toMatch(/confirmas/i);
    const expenses = await listExpenses(familyId);
    expect(expenses).toHaveLength(0);
  });

  it("'Crea un evento para el sábado a las diez de la mañana' crea el evento en la fecha y hora correctas", async () => {
    const { familyId, adultId } = await createTestFamily("rules-create-event");
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "Crea un evento para el sábado a las diez de la mañana",
      null
    );
    expect(reply).toMatch(/10:00/);
    const events = await listEvents(familyId, {});
    expect(events).toHaveLength(1);
    expect(events[0].start_at.slice(11, 16)).toBe("10:00");
  });

  it("responde con un mensaje de ayuda cuando no reconoce el comando", async () => {
    const { familyId, adultId } = await createTestFamily("rules-unknown");
    const { reply } = await handleWithRules(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "cuéntame un poema sobre el otoño",
      null
    );
    expect(reply).toMatch(/ANTHROPIC_API_KEY/);
  });
});
