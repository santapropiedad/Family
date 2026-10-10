import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, createTestFamily } from "./helpers";
import { executeTool, confirmPendingAction, rejectPendingAction } from "@/ai/executor";
import { createBill } from "@/services/bills";
import { createTask } from "@/services/tasks";
import { listBills } from "@/services/bills";
import { getTask } from "@/services/tasks";
import { ForbiddenError } from "@/lib/errors";

beforeEach(freshDb);

describe("motor de IA: niveles de confirmación", () => {
  it("ejecuta de inmediato una herramienta de nivel auto (agregar a la lista de compras)", async () => {
    const { familyId, adultId } = await createTestFamily("auto");
    const result = await executeTool(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "add_shopping_item",
      { name: "Pan" }
    );
    expect(result.status).toBe("executed");
  });

  it("deja pendiente de confirmación una herramienta de nivel 'confirm' (eliminar tarea)", async () => {
    const { familyId, adultId } = await createTestFamily("confirm");
    const task = await createTask(familyId, { title: "Por eliminar" });

    const result = await executeTool(
      { familyId, actorMemberId: adultId, actorRole: "adult" },
      "delete_task",
      { task_id: task.id }
    );
    expect(result.status).toBe("pending_confirmation");

    // La tarea NO debe haberse borrado todavía.
    const stillThere = await getTask(familyId, task.id);
    expect(stillThere.id).toBe(task.id);
  });

  it("nunca ejecuta un pago (nivel always_confirm) sin confirmación explícita del usuario", async () => {
    const { familyId, adultId } = await createTestFamily("pay");
    const bill = await createBill(familyId, {
      name: "Luz",
      amount: 10000,
      dueDate: new Date().toISOString().slice(0, 10),
    });

    const result = await executeTool({ familyId, actorMemberId: adultId, actorRole: "adult" }, "pay_bill", {
      bill_id: bill.id,
    });
    expect(result.status).toBe("pending_confirmation");

    const bills = await listBills(familyId);
    expect(bills[0].status).toBe("pending");
  });

  it("confirmar una acción pendiente la ejecuta de verdad", async () => {
    const { familyId, adultId } = await createTestFamily("confirm2");
    const bill = await createBill(familyId, {
      name: "Agua",
      amount: 15000,
      dueDate: new Date().toISOString().slice(0, 10),
    });
    const ctx = { familyId, actorMemberId: adultId, actorRole: "adult" as const };
    const pending = await executeTool(ctx, "pay_bill", { bill_id: bill.id });

    await confirmPendingAction(ctx, pending.actionId);

    const bills = await listBills(familyId);
    expect(bills.find((b) => b.id === bill.id)?.status).toBe("paid");
  });

  it("rechazar una acción pendiente no la ejecuta", async () => {
    const { familyId, adultId } = await createTestFamily("reject");
    const task = await createTask(familyId, { title: "No borrar" });
    const ctx = { familyId, actorMemberId: adultId, actorRole: "adult" as const };
    const pending = await executeTool(ctx, "delete_task", { task_id: task.id });

    await rejectPendingAction(ctx, pending.actionId);

    const stillThere = await getTask(familyId, task.id);
    expect(stillThere.id).toBe(task.id);
  });

  it("un niño no puede pagar cuentas: la herramienta queda bloqueada por permisos", async () => {
    const { familyId, childId } = await createTestFamily("child-blocked");
    const bill = await createBill(familyId, {
      name: "Internet",
      amount: 20000,
      dueDate: new Date().toISOString().slice(0, 10),
    });
    await expect(
      executeTool({ familyId, actorMemberId: childId, actorRole: "child" }, "pay_bill", { bill_id: bill.id })
    ).rejects.toThrow(ForbiddenError);
  });

  it("un niño puede usar herramientas de solo lectura", async () => {
    const { familyId, childId } = await createTestFamily("child-read");
    const result = await executeTool(
      { familyId, actorMemberId: childId, actorRole: "child" },
      "list_shopping_items",
      {}
    );
    expect(result.status).toBe("executed");
  });
});
