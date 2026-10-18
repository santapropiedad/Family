import type { Capability, Role } from "@/lib/permissions";
import * as tasksService from "@/services/tasks";
import * as eventsService from "@/services/events";
import * as remindersService from "@/services/reminders";
import * as shoppingService from "@/services/shopping";
import * as expensesService from "@/services/expenses";
import * as maintenanceService from "@/services/maintenance";
import * as billsService from "@/services/bills";
import * as memoriesService from "@/services/memories";
import * as membersService from "@/services/members";
import { AppError } from "@/lib/errors";
import type { Bill, ShoppingItem } from "@/types/domain";

export interface ToolContext {
  familyId: string;
  actorMemberId: string;
  actorRole: Role;
}

export type ConfirmationLevel = "auto" | "confirm" | "always_confirm";

/** Umbral sobre el cual un gasto pasa de ejecutarse directo a pedir confirmación primero. */
export const EXPENSE_CONFIRMATION_THRESHOLD = 30_000;

export interface ToolDefinition {
  name: string;
  /** Spanish description shown to the Claude model as the tool's function description. */
  description: string;
  parameters: Record<string, unknown>;
  /** Fijo, o calculado a partir de los parámetros (ej. pedir confirmación solo sobre cierto monto). */
  confirmationLevel: ConfirmationLevel | ((params: Record<string, unknown>) => ConfirmationLevel);
  requiredCapability: Capability | null;
  handler: (ctx: ToolContext, params: Record<string, unknown>) => Promise<unknown>;
}

export function resolveConfirmationLevel(
  tool: Pick<ToolDefinition, "confirmationLevel">,
  params: Record<string, unknown>
): ConfirmationLevel {
  return typeof tool.confirmationLevel === "function" ? tool.confirmationLevel(params) : tool.confirmationLevel;
}

/** Gastos iguales o mayores al umbral piden confirmación; montos más chicos se registran directo. */
function confirmLargeExpense(params: Record<string, unknown>): ConfirmationLevel {
  const amount = Number(params.amount ?? 0);
  return amount >= EXPENSE_CONFIRMATION_THRESHOLD ? "confirm" : "auto";
}

function str(description: string, extra: Record<string, unknown> = {}) {
  return { type: "string", description, ...extra };
}
function num(description: string) {
  return { type: "number", description };
}

export const TOOLS: ToolDefinition[] = [
  // --- Tareas ---
  {
    name: "create_task",
    description: "Crea una tarea doméstica o pendiente, opcionalmente asignada a uno o más integrantes.",
    parameters: {
      type: "object",
      properties: {
        title: str("Título breve de la tarea"),
        description: str("Detalle opcional"),
        priority: str("Prioridad: red (urgente), yellow (normal) o green (baja)", {
          enum: ["red", "yellow", "green"],
        }),
        due_date: str("Fecha límite en formato YYYY-MM-DD, si aplica"),
        assignee_ids: { type: "array", items: { type: "string" }, description: "IDs de integrantes asignados" },
      },
      required: ["title"],
    },
    confirmationLevel: "auto",
    requiredCapability: "tasks:create",
    handler: async (ctx, params) =>
      tasksService.createTask(ctx.familyId, {
        title: params.title as string,
        description: (params.description as string) ?? null,
        priority: params.priority as tasksService.CreateTaskInput["priority"],
        dueDate: (params.due_date as string) ?? null,
        assigneeIds: (params.assignee_ids as string[]) ?? undefined,
        source: "ai",
        createdBy: ctx.actorMemberId,
      }),
  },
  {
    name: "complete_task",
    description: "Marca una tarea como completada.",
    parameters: { type: "object", properties: { task_id: str("ID de la tarea") }, required: ["task_id"] },
    confirmationLevel: "auto",
    requiredCapability: "tasks:manage_own",
    handler: async (ctx, params) => tasksService.completeTask(ctx.familyId, params.task_id as string),
  },
  {
    name: "list_tasks",
    description: "Consulta tareas de la familia, opcionalmente filtradas por estado o integrante.",
    parameters: {
      type: "object",
      properties: {
        status: str("pending, completed o cancelled", { enum: ["pending", "completed", "cancelled"] }),
        assigned_to: str("ID del integrante"),
      },
    },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx, params) =>
      tasksService.listTasks(ctx.familyId, {
        status: params.status as tasksService.TaskFilters["status"],
        assignedTo: params.assigned_to as string,
      }),
  },
  {
    name: "delete_task",
    description: "Elimina una tarea de forma permanente.",
    parameters: { type: "object", properties: { task_id: str("ID de la tarea") }, required: ["task_id"] },
    confirmationLevel: "confirm",
    requiredCapability: "tasks:manage_any",
    handler: async (ctx, params) => {
      await tasksService.deleteTask(ctx.familyId, params.task_id as string);
      return { deleted: true };
    },
  },

  // --- Eventos ---
  {
    name: "create_event",
    description: "Crea un evento en el calendario familiar (cumpleaños, cita, actividad, etc.).",
    parameters: {
      type: "object",
      properties: {
        title: str("Título del evento"),
        category: str("Categoría", {
          enum: ["birthday", "school", "appointment", "activity", "vacation", "payment", "maintenance", "family", "other"],
        }),
        start_at: str("Fecha y hora ISO 8601 de inicio"),
        end_at: str("Fecha y hora ISO 8601 de término, si aplica"),
        location: str("Lugar, si aplica"),
        assignee_ids: { type: "array", items: { type: "string" }, description: "IDs de integrantes involucrados" },
      },
      required: ["title", "start_at"],
    },
    confirmationLevel: "auto",
    requiredCapability: "events:manage",
    handler: async (ctx, params) =>
      eventsService.createEvent(ctx.familyId, {
        title: params.title as string,
        category: params.category as eventsService.CreateEventInput["category"],
        startAt: params.start_at as string,
        endAt: (params.end_at as string) ?? null,
        location: (params.location as string) ?? null,
        assigneeIds: (params.assignee_ids as string[]) ?? undefined,
        source: "ai",
        createdBy: ctx.actorMemberId,
      }),
  },
  {
    name: "list_events",
    description: "Consulta eventos del calendario familiar en un rango de fechas, o de un integrante.",
    parameters: {
      type: "object",
      properties: {
        from: str("ISO 8601 desde"),
        to: str("ISO 8601 hasta"),
        member_id: str("ID del integrante"),
      },
    },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx, params) =>
      eventsService.listEvents(ctx.familyId, {
        from: params.from as string,
        to: params.to as string,
        memberId: params.member_id as string,
      }),
  },
  {
    name: "delete_event",
    description: "Elimina un evento del calendario.",
    parameters: { type: "object", properties: { event_id: str("ID del evento") }, required: ["event_id"] },
    confirmationLevel: "confirm",
    requiredCapability: "events:manage",
    handler: async (ctx, params) => {
      await eventsService.deleteEvent(ctx.familyId, params.event_id as string);
      return { deleted: true };
    },
  },

  // --- Recordatorios ---
  {
    name: "create_reminder",
    description: "Crea un recordatorio para una fecha y hora específica, opcionalmente recurrente.",
    parameters: {
      type: "object",
      properties: {
        title: str("Qué recordar"),
        remind_at: str("Fecha y hora ISO 8601"),
        recurrence: str("none, daily, weekly o monthly", { enum: ["none", "daily", "weekly", "monthly"] }),
      },
      required: ["title", "remind_at"],
    },
    confirmationLevel: "auto",
    requiredCapability: "reminders:manage",
    handler: async (ctx, params) =>
      remindersService.createReminder(ctx.familyId, {
        title: params.title as string,
        remindAt: params.remind_at as string,
        recurrence: params.recurrence as remindersService.CreateReminderInput["recurrence"],
        source: "ai",
        createdBy: ctx.actorMemberId,
      }),
  },
  {
    name: "list_reminders",
    description: "Consulta recordatorios pendientes.",
    parameters: { type: "object", properties: { status: str("pending, done o dismissed") } },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx, params) =>
      remindersService.listReminders(ctx.familyId, {
        status: params.status as remindersService.ReminderFilters["status"],
      }),
  },
  {
    name: "delete_reminder",
    description: "Elimina un recordatorio.",
    parameters: { type: "object", properties: { reminder_id: str("ID del recordatorio") }, required: ["reminder_id"] },
    confirmationLevel: "auto",
    requiredCapability: "reminders:manage",
    handler: async (ctx, params) => {
      await remindersService.deleteReminder(ctx.familyId, params.reminder_id as string);
      return { deleted: true };
    },
  },

  // --- Compras e inventario ---
  {
    name: "add_shopping_item",
    description: "Agrega un producto a la lista de compras familiar.",
    parameters: {
      type: "object",
      properties: {
        name: str("Nombre del producto"),
        quantity: num("Cantidad, por defecto 1"),
        unit: str("Unidad (kg, litros, unidades, etc.)"),
        priority: str("red, yellow o green", { enum: ["red", "yellow", "green"] }),
        store: str("Tienda a la que pertenece: Feria o Supermercado, si se menciona"),
      },
      required: ["name"],
    },
    confirmationLevel: "auto",
    requiredCapability: "shopping:manage",
    handler: async (ctx, params) =>
      shoppingService.addShoppingItem(ctx.familyId, {
        name: params.name as string,
        quantity: params.quantity as number,
        unit: (params.unit as string) ?? null,
        priority: params.priority as shoppingService.AddShoppingItemInput["priority"],
        store: (params.store as string) ?? null,
        source: "ai",
      }),
  },
  {
    name: "list_shopping_items",
    description: "Consulta la lista de compras pendiente o lo ya comprado.",
    parameters: { type: "object", properties: { status: str("pending o purchased") } },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx, params) =>
      shoppingService.listShoppingItems(ctx.familyId, params.status as ShoppingItem["status"]),
  },
  {
    name: "remove_shopping_item",
    description: "Elimina un producto de la lista de compras sin registrar una compra.",
    parameters: { type: "object", properties: { item_id: str("ID del producto en la lista") }, required: ["item_id"] },
    confirmationLevel: "auto",
    requiredCapability: "shopping:manage",
    handler: async (ctx, params) => {
      await shoppingService.removeShoppingItem(ctx.familyId, params.item_id as string);
      return { deleted: true };
    },
  },
  {
    name: "record_purchase",
    description:
      "Registra que se compró un producto por un monto determinado: crea el gasto, actualiza el inventario y lo quita de la lista de compras si estaba pendiente. Úsalo para frases como 'compré leche por $8.990'.",
    parameters: {
      type: "object",
      properties: {
        item_name: str("Nombre del producto comprado"),
        amount: num("Monto pagado en pesos"),
        quantity: num("Cantidad comprada, por defecto 1"),
        unit: str("Unidad, si se menciona"),
      },
      required: ["item_name", "amount"],
    },
    confirmationLevel: confirmLargeExpense,
    requiredCapability: "shopping:manage",
    handler: async (ctx, params) =>
      shoppingService.recordPurchase(ctx.familyId, {
        itemName: params.item_name as string,
        amount: params.amount as number,
        quantity: params.quantity as number,
        unit: (params.unit as string) ?? null,
        familyMemberId: ctx.actorMemberId,
        source: "ai",
        createdBy: ctx.actorMemberId,
      }),
  },
  {
    name: "add_purchased_quantity",
    description:
      "Suma al inventario una cantidad que el usuario dice haber comprado, sin registrar ningún gasto. Úsalo cuando mencione qué compró pero NO diga el precio (si dice el precio, usa record_purchase en su lugar).",
    parameters: {
      type: "object",
      properties: {
        item_name: str("Nombre del producto"),
        quantity: num("Cantidad comprada, por defecto 1"),
        unit: str("Unidad, si se menciona (kg, litros, unidades, etc.)"),
      },
      required: ["item_name"],
    },
    confirmationLevel: "auto",
    requiredCapability: "inventory:manage",
    handler: async (ctx, params) =>
      shoppingService.upsertInventoryOnPurchase(ctx.familyId, params.item_name as string, {
        quantityDelta: (params.quantity as number) ?? 1,
        unit: (params.unit as string) ?? null,
      }),
  },
  {
    name: "list_inventory",
    description: "Consulta el inventario doméstico (qué hay y cuánto queda de cada producto).",
    parameters: { type: "object", properties: {} },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx) => shoppingService.listInventory(ctx.familyId),
  },

  // --- Gastos ---
  {
    name: "log_expense",
    description: "Registra un gasto familiar con su categoría, monto y fecha.",
    parameters: {
      type: "object",
      properties: {
        amount: num("Monto en pesos"),
        category_name: str("Nombre de la categoría (Alimentación, Vivienda, Servicios, Transporte, Educación, Salud, Niños, Entretenimiento, Compras, Mascotas, Otros)"),
        description: str("Descripción breve"),
        merchant: str("Comercio, si se menciona"),
        is_recurring: { type: "boolean", description: "Si es un gasto que se repite periódicamente" },
      },
      required: ["amount"],
    },
    confirmationLevel: confirmLargeExpense,
    requiredCapability: "finances:manage",
    handler: async (ctx, params) => {
      const categoryName = params.category_name as string | undefined;
      const category = categoryName ? await expensesService.findCategoryByName(ctx.familyId, categoryName) : null;
      return expensesService.createExpense(ctx.familyId, {
        amount: params.amount as number,
        categoryId: category?.id ?? null,
        description: (params.description as string) ?? null,
        merchant: (params.merchant as string) ?? null,
        familyMemberId: ctx.actorMemberId,
        isRecurring: Boolean(params.is_recurring),
        source: "ai",
        createdBy: ctx.actorMemberId,
      });
    },
  },
  {
    name: "list_expenses",
    description: "Consulta los gastos más recientes registrados, opcionalmente filtrados por categoría.",
    parameters: {
      type: "object",
      properties: {
        category_id: str("ID de la categoría, si se quiere filtrar"),
        limit: num("Cuántos gastos devolver como máximo, por defecto 5"),
      },
    },
    confirmationLevel: "auto",
    requiredCapability: "finances:view",
    handler: async (ctx, params) => {
      const expenses = await expensesService.listExpenses(ctx.familyId, {
        categoryId: params.category_id as string | undefined,
      });
      const limit = (params.limit as number) ?? 5;
      return expenses.slice(0, limit);
    },
  },
  {
    name: "query_expenses_summary",
    description:
      "Responde preguntas financieras como '¿cuánto hemos gastado este mes?' o '¿en qué estamos gastando más?' usando únicamente los datos registrados.",
    parameters: {
      type: "object",
      properties: {
        from: str("Fecha de inicio YYYY-MM-DD"),
        to: str("Fecha de término YYYY-MM-DD"),
      },
      required: ["from", "to"],
    },
    confirmationLevel: "auto",
    requiredCapability: "finances:view",
    handler: async (ctx, params) => {
      const [byCategory, total] = await Promise.all([
        expensesService.summarizeByCategory(ctx.familyId, params.from as string, params.to as string),
        expensesService.totalForPeriod(ctx.familyId, params.from as string, params.to as string),
      ]);
      return { total, byCategory };
    },
  },

  // --- Casa: mantenciones y cuentas ---
  {
    name: "create_maintenance",
    description: "Registra un equipo o artefacto del hogar y su calendario de mantención.",
    parameters: {
      type: "object",
      properties: {
        name: str("Nombre del equipo (ej. calefont, piscina)"),
        next_maintenance_at: str("Próxima mantención YYYY-MM-DD"),
        frequency_days: num("Frecuencia en días entre mantenciones"),
        provider: str("Proveedor o técnico habitual"),
      },
      required: ["name"],
    },
    confirmationLevel: "auto",
    requiredCapability: "maintenance:manage",
    handler: async (ctx, params) =>
      maintenanceService.createMaintenance(ctx.familyId, {
        name: params.name as string,
        nextMaintenanceAt: (params.next_maintenance_at as string) ?? null,
        frequencyDays: (params.frequency_days as number) ?? null,
        provider: (params.provider as string) ?? null,
      }),
  },
  {
    name: "list_maintenance",
    description: "Consulta mantenciones del hogar y cuándo corresponde la próxima.",
    parameters: { type: "object", properties: {} },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx) => maintenanceService.listMaintenance(ctx.familyId),
  },
  {
    name: "list_bills",
    description: "Consulta cuentas del hogar (luz, agua, internet, etc.) y su estado de pago.",
    parameters: { type: "object", properties: { status: str("pending, paid u overdue") } },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx, params) => billsService.listBills(ctx.familyId, params.status as Bill["status"]),
  },
  {
    name: "pay_bill",
    description: "Marca una cuenta como pagada y registra el gasto correspondiente. Es una acción financiera sensible.",
    parameters: { type: "object", properties: { bill_id: str("ID de la cuenta") }, required: ["bill_id"] },
    confirmationLevel: "always_confirm",
    requiredCapability: "bills:manage",
    handler: async (ctx, params) => billsService.payBill(ctx.familyId, params.bill_id as string, ctx.actorMemberId),
  },

  // --- Familia ---
  {
    name: "list_family_members",
    description: "Consulta los integrantes de la familia.",
    parameters: { type: "object", properties: {} },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx) => membersService.listMembers(ctx.familyId),
  },

  // --- Memoria ---
  {
    name: "remember_fact",
    description:
      "Guarda un dato útil y estructurado en la memoria de la familia (preferencia, rutina, dato permanente o temporal). No usar para guardar conversaciones completas.",
    parameters: {
      type: "object",
      properties: {
        content: str("El dato a recordar, en una frase clara"),
        type: str("permanent o temporary", { enum: ["permanent", "temporary"] }),
        category: str("Categoría libre: preferencia, rutina, dato, etc."),
        expires_at: str("Fecha ISO de expiración si type es temporary"),
      },
      required: ["content", "type"],
    },
    confirmationLevel: "auto",
    requiredCapability: "memory:manage",
    handler: async (ctx, params) =>
      memoriesService.createMemory(ctx.familyId, {
        content: params.content as string,
        type: params.type as memoriesService.CreateMemoryInput["type"],
        category: (params.category as string) ?? null,
        expiresAt: (params.expires_at as string) ?? null,
        createdBy: "ai",
      }),
  },
  {
    name: "list_memories",
    description: "Consulta lo que la IA recuerda de la familia.",
    parameters: { type: "object", properties: {} },
    confirmationLevel: "auto",
    requiredCapability: null,
    handler: async (ctx) => memoriesService.listMemories(ctx.familyId),
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new AppError(`Herramienta de IA desconocida: ${name}`, 400, "unknown_tool");
  return tool;
}
