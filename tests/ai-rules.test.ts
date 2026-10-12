import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import { handleWithRules } from "@/ai/rules";
import { listExpenses } from "@/services/expenses";
import { listShoppingItems } from "@/services/shopping";
import { parseAmount, parseQuantityItem, parseRelativeDate } from "@/ai/parsing";

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
