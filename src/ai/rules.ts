import type { ToolContext } from "@/ai/tools";
import { executeTool, type ExecuteResult } from "@/ai/executor";
import { parseAmount, parseQuantityItem, parseRecurrence, parseRelativeDate, parseTimeOfDay } from "@/ai/parsing";
import * as membersService from "@/services/members";
import { buildTodaySummary } from "@/services/insights";
import type { FamilyMember } from "@/types/domain";

export interface RuleResult {
  reply: string;
  action?: ExecuteResult;
}

function findMemberByName(members: FamilyMember[], text: string): FamilyMember | null {
  const lower = text.toLowerCase();
  return members.find((m) => lower.includes(m.name.toLowerCase())) ?? null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

/** "15 minutos" / "2 horas" / "media hora" / "una hora" / "un día" / "3 días" -> minutos. */
function parseMinutesPhrase(text: string): number | null {
  const lower = text.toLowerCase();
  const numMatch = lower.match(/(\d+)\s*(minutos?|horas?|d[ií]as?)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (/hora/.test(numMatch[2])) return n * 60;
    if (/d[ií]a/.test(numMatch[2])) return n * 1440;
    return n;
  }
  if (/media\s+hora/.test(lower)) return 30;
  if (/\buna?\s+hora\b/.test(lower)) return 60;
  if (/\bun\s+d[ií]a\b/.test(lower)) return 1440;
  return null;
}

/** Busca por coincidencia parcial de nombre/título en cualquiera de los dos sentidos. */
function findByName<T>(items: T[], target: string, nameOf: (item: T) => string): T | undefined {
  const lowerTarget = target.toLowerCase().trim();
  return items.find((i) => {
    const name = nameOf(i).toLowerCase();
    return name.includes(lowerTarget) || lowerTarget.includes(name);
  });
}

/**
 * Motor de reglas: interpreta los comandos de voz/texto más comunes (sección 23 de la
 * especificación) sin necesidad de un modelo de lenguaje. Se usa automáticamente cuando
 * ANTHROPIC_API_KEY no está configurada, para que la app funcione igual en lo esencial.
 * No sostiene conversación libre ni entiende frases fuera de estos patrones.
 */
export async function handleWithRules(
  ctx: ToolContext,
  text: string,
  conversationId: string | null
): Promise<RuleResult> {
  const lower = text.toLowerCase().trim();
  const members = await membersService.listMembers(ctx.familyId);

  // Saludos y cortesías básicas: sin esto, algo tan simple como "gracias" caía en el
  // "no entendí" de más abajo.
  if (/^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches)[\s!¡.,]*$/.test(lower)) {
    return { reply: "¡Hola! ¿En qué te ayudo?" };
  }
  if (/^(gracias|muchas gracias|te pasaste|genial|perfecto|ok|dale|bien|buena)[\s!¡.,]*$/.test(lower)) {
    return { reply: "¡De nada! Avísame si necesitas algo más." };
  }
  if (/^(chao|adi[oó]s|nos vemos|hasta luego)[\s!¡.,]*$/.test(lower)) {
    return { reply: "¡Chao! Aquí estaré cuando me necesites." };
  }

  // "Compré leche por $8.990" / "compre leche por 8990 pesos"
  const buyMatch = lower.match(/compr[eé]\s+(.+?)\s+por\s+(.+)/);
  if (buyMatch) {
    const amount = parseAmount(buyMatch[2]);
    if (amount) {
      const action = await executeTool(
        ctx,
        "record_purchase",
        { item_name: buyMatch[1].trim(), amount },
        conversationId
      );
      return {
        reply:
          action.status === "pending_confirmation"
            ? action.confirmationMessage!
            : `Listo. Registré la compra de ${buyMatch[1].trim()} por ${money(amount)}, actualicé el inventario y la quité de la lista si estaba pendiente.`,
        action,
      };
    }
  }

  // "Registra que compré tres litros de leche" (sin mencionar el precio: solo suma al
  // inventario, no se inventa ni se pide un gasto que el usuario nunca mencionó).
  const buyNoAmountMatch = lower.match(/(?:registra\s+que\s+)?compr[eé]\s+(.+)/);
  if (buyNoAmountMatch) {
    const parsed = parseQuantityItem(buyNoAmountMatch[1]);
    const itemName = parsed ? parsed.name : buyNoAmountMatch[1].trim();
    const action = await executeTool(
      ctx,
      "add_purchased_quantity",
      parsed ? { item_name: parsed.name, quantity: parsed.quantity, unit: parsed.unit } : { item_name: itemName },
      conversationId
    );
    return {
      reply: `Listo, actualicé el inventario de "${itemName}". Como no mencionaste el precio, no registré ningún gasto — si quieres, dime el monto y lo agrego.`,
      action,
    };
  }

  // "Registra un gasto de 5.000 pesos en transporte" (imperativo, sin "compré")
  const imperativeExpenseMatch = lower.match(/registra\s+un\s+gasto\s+de\s+(.+?)\s+(?:en|de)\s+(.+)/);
  if (imperativeExpenseMatch) {
    const amount = parseAmount(imperativeExpenseMatch[1]);
    if (amount) {
      const category = imperativeExpenseMatch[2].trim();
      const action = await executeTool(
        ctx,
        "log_expense",
        { amount, category_name: category, description: category },
        conversationId
      );
      return {
        reply:
          action.status === "pending_confirmation"
            ? action.confirmationMessage!
            : `Registré un gasto de ${money(amount)} en ${category}.`,
        action,
      };
    }
  }

  // "¿Cuánto hemos gastado en supermercado?" (por categoría, antes del total general)
  const categorySpendMatch = lower.match(/cu[aá]nto.*gastado.*en\s+(.+?)[\s?¿.!]*$/);
  if (categorySpendMatch) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const action = await executeTool(ctx, "query_expenses_summary", { from, to }, conversationId);
    const data = action.result as
      | { total: number; byCategory: Array<{ categoryName: string | null; total: number }> }
      | undefined;
    const target = categorySpendMatch[1].trim();
    const match = data?.byCategory.find(
      (c) => c.categoryName && (target.includes(c.categoryName.toLowerCase()) || c.categoryName.toLowerCase().includes(target))
    );
    return {
      reply: match
        ? `En ${match.categoryName} han gastado ${money(match.total)} este mes.`
        : `No encontré gastos este mes en "${target}".`,
      action,
    };
  }

  // "Muéstrame los últimos gastos"
  if (/(mu[eé]stra|ver|dime).*(gastos|gasto)|[uú]ltimos gastos/.test(lower)) {
    const action = await executeTool(ctx, "list_expenses", { limit: 5 }, conversationId);
    const expenses = (action.result as Array<{ amount: string; description: string | null; merchant: string | null }>) ?? [];
    const reply =
      expenses.length === 0
        ? "No hay gastos registrados todavía."
        : `Tus últimos gastos: ${expenses
            .map((e) => `${e.description || e.merchant || "Gasto"} por ${money(Number(e.amount))}`)
            .join("; ")}.`;
    return { reply, action };
  }

  // "Elimina el gasto de supermercado" / "borra el gasto de transporte" (busca entre los últimos 20)
  const deleteExpenseMatch = lower.match(/(?:elimina(?:r)?|borra(?:r)?)\s+el\s+gasto\s+(?:de\s+)?(.+)/);
  if (deleteExpenseMatch) {
    const target = deleteExpenseMatch[1].trim();
    const listAction = await executeTool(ctx, "list_expenses", { limit: 20 }, conversationId);
    const expenses =
      (listAction.result as Array<{ id: string; description: string | null; merchant: string | null }>) ?? [];
    const match = findByName(expenses, target, (e) => e.description || e.merchant || "");
    if (!match) {
      return { reply: `No encontré ningún gasto reciente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "delete_expense", { expense_id: match.id }, conversationId);
    return {
      reply: action.status === "pending_confirmation" ? action.confirmationMessage! : "Eliminé ese gasto.",
      action,
    };
  }

  // "Gasté 20 mil pesos en supermercado" / "registré 15 mil pesos de supermercado"
  const spendMatch = lower.match(/(?:gast[eé]|registr[eé])\s+(.+?)\s+(?:en|de)\s+(.+)/);
  if (spendMatch) {
    const amount = parseAmount(spendMatch[1]);
    if (amount) {
      const action = await executeTool(
        ctx,
        "log_expense",
        { amount, description: spendMatch[2].trim() },
        conversationId
      );
      return {
        reply:
          action.status === "pending_confirmation"
            ? action.confirmationMessage!
            : `Registré un gasto de ${money(amount)} en ${spendMatch[2].trim()}.`,
        action,
      };
    }
  }

  // "¿Cuánta leche queda?" / "¿cuántos huevos tenemos?"
  const stockMatch = lower.match(/cu[aá]nt[oa]s?\s+(.+?)\s+(queda|quedan|hay|tenemos)\b/);
  if (stockMatch) {
    const action = await executeTool(ctx, "list_inventory", {}, conversationId);
    const items = (action.result as Array<{ name: string; current_quantity: string; unit: string | null }>) ?? [];
    const target = stockMatch[1].trim();
    const match = items.find(
      (i) => i.name.toLowerCase().includes(target) || target.includes(i.name.toLowerCase())
    );
    return {
      reply: match
        ? `Quedan ${Number(match.current_quantity)} ${match.unit ?? "unidades"} de ${match.name}.`
        : `No tengo registrado "${target}" en el inventario.`,
      action,
    };
  }

  // "Agrega leche" / "agrega tres kilos de arroz" / "agrega leche a las compras" /
  // "agrega leche a la lista del supermercado" / "agrega pan a la feria" / "ingresa leche a la lista"
  // (excluye "agrega una tarea/evento/recordatorio/cuenta/mantención", que tienen sus propios patrones).
  if (
    /^(?:agrega(?:r)?|ingresa(?:r)?)\b(?!\s+(?:(?:el|la|los|las|una?)\s+)?(?:tarea|evento|recordatorio|cuenta|mantenci[oó]n)\b)/.test(
      lower
    )
  ) {
    const withoutVerb = lower.replace(/^(agrega(r)?|ingresa(r)?)\s+/, "");
    const store = /\bferia\b/.test(withoutVerb) ? "Feria" : /\bsupermercado\b/.test(withoutVerb) ? "Supermercado" : null;
    // Corta cualquier remate tipo "a la lista", "a las compras", "a la feria", "al supermercado"
    // (con lo que venga después, ej. "del supermercado") para no incluirlo en el nombre del producto.
    const rest = withoutVerb.replace(/\s+a(l)?\s+(la\s+)?(lista|las?\s+compras|feria|supermercado).*$/, "");
    const parsed = parseQuantityItem(rest);
    const action = await executeTool(
      ctx,
      "add_shopping_item",
      parsed
        ? { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, store }
        : { name: rest.trim(), store },
      conversationId
    );
    const itemName = parsed ? parsed.name : rest.trim();
    return { reply: `Agregué "${itemName}" a la lista de compras${store ? ` de ${store}` : ""}.`, action };
  }

  // "Quita el pan de la lista" / "elimina la leche de las compras"
  const removeShoppingMatch = lower.match(
    /(?:quita(?:r)?|elimina(?:r)?|borra(?:r)?)\s+(.+?)\s+de\s+la\s+lista(?:\s+de\s+compras)?/
  );
  if (removeShoppingMatch) {
    const target = removeShoppingMatch[1].trim();
    const listAction = await executeTool(ctx, "list_shopping_items", { status: "pending" }, conversationId);
    const items = (listAction.result as Array<{ id: string; name: string }>) ?? [];
    const match = items.find(
      (i) => i.name.toLowerCase().includes(target) || target.includes(i.name.toLowerCase())
    );
    if (!match) {
      return { reply: `No encontré "${target}" en la lista de compras.`, action: listAction };
    }
    const action = await executeTool(ctx, "remove_shopping_item", { item_id: match.id }, conversationId);
    return { reply: `Quité "${match.name}" de la lista de compras.`, action };
  }

  // "Recuérdame comprar pan mañana" / "recuérdame pagar internet todos los meses"
  const reminderMatch = lower.match(/recu[eé]rdame\s+(.+)/);
  if (reminderMatch) {
    const body = reminderMatch[1];
    const date = parseRelativeDate(body) ?? parseRelativeDate("mañana");
    const recurrence = parseRecurrence(body);
    const remindAt = `${date}T09:00:00`;
    const action = await executeTool(
      ctx,
      "create_reminder",
      { title: body.replace(/\s+(mañana|hoy|todos los (días|dias|meses)|cada semana)\s*$/i, "").trim(), remind_at: remindAt, recurrence },
      conversationId
    );
    return { reply: `Te voy a recordar: "${body.trim()}".`, action };
  }

  // "Elimina el recordatorio de pagar internet" / "cancela el recordatorio del dentista"
  const deleteReminderMatch = lower.match(
    /(?:elimina(?:r)?|borra(?:r)?|cancela(?:r)?)\s+el\s+recordatorio\s+(?:de\s+)?(.+)/
  );
  if (deleteReminderMatch) {
    const target = deleteReminderMatch[1].trim();
    const listAction = await executeTool(ctx, "list_reminders", { status: "pending" }, conversationId);
    const reminders = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = reminders.find(
      (r) => r.title.toLowerCase().includes(target) || target.includes(r.title.toLowerCase())
    );
    if (!match) {
      return { reply: `No encontré ningún recordatorio pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "delete_reminder", { reminder_id: match.id }, conversationId);
    return { reply: `Eliminé el recordatorio "${match.title}".`, action };
  }

  // "Pospón el recordatorio de pagar internet 15 minutos" / "posterga el recordatorio X una hora"
  const postponeReminderMatch = lower.match(
    /(?:pospo(?:n|ne)(?:r)?|posp[oó]n|posterga(?:r)?)\s+el\s+recordatorio\s+(?:de\s+)?(.+?)\s+(\d+\s*(?:minutos?|horas?|d[ií]as?)|media\s+hora|una?\s+hora|un\s+d[ií]a)\s*$/
  );
  if (postponeReminderMatch) {
    const target = postponeReminderMatch[1].trim();
    const minutes = parseMinutesPhrase(postponeReminderMatch[2])!;
    const listAction = await executeTool(ctx, "list_reminders", { status: "pending" }, conversationId);
    const reminders = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(reminders, target, (r) => r.title);
    if (!match) {
      return { reply: `No encontré ningún recordatorio pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "postpone_reminder", { reminder_id: match.id, minutes }, conversationId);
    return { reply: `Pospuse el recordatorio "${match.title}".`, action };
  }

  // "Cambia la fecha del recordatorio de pagar internet para mañana" / "reprograma el recordatorio X al viernes"
  const rescheduleReminderMatch = lower.match(
    /(?:reprograma(?:r)?|cambia(?:r)?\s+la\s+fecha\s+del?)\s+(?:el\s+)?recordatorio\s+(?:de\s+)?(.+)/
  );
  if (rescheduleReminderMatch) {
    const rest = rescheduleReminderMatch[1];
    const date = parseRelativeDate(rest);
    if (date) {
      const time = parseTimeOfDay(rest) ?? "09:00:00";
      const target = rest
        .replace(/\ba\s+las?\s+.+$/i, "")
        .replace(/\s+(?:para|al)\s+.*$/i, "")
        .trim();
      const listAction = await executeTool(ctx, "list_reminders", { status: "pending" }, conversationId);
      const reminders = (listAction.result as Array<{ id: string; title: string }>) ?? [];
      const match = findByName(reminders, target, (r) => r.title);
      if (!match) {
        return { reply: `No encontré ningún recordatorio pendiente que coincida con "${target}".`, action: listAction };
      }
      const action = await executeTool(
        ctx,
        "update_reminder",
        { reminder_id: match.id, remind_at: `${date}T${time}` },
        conversationId
      );
      return { reply: `Reprogramé el recordatorio "${match.title}" para el ${date} a las ${time.slice(0, 5)}.`, action };
    }
  }

  // "Cambia el recordatorio de pagar internet a pagar el gas" (cambia el texto)
  const renameReminderMatch = lower.match(/cambia(?:r)?\s+el\s+recordatorio\s+(?:de\s+)?(.+?)\s+a\s+(.+)/);
  if (renameReminderMatch) {
    const target = renameReminderMatch[1].trim();
    const newTitle = renameReminderMatch[2].trim();
    const listAction = await executeTool(ctx, "list_reminders", { status: "pending" }, conversationId);
    const reminders = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(reminders, target, (r) => r.title);
    if (!match) {
      return { reply: `No encontré ningún recordatorio pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(
      ctx,
      "update_reminder",
      { reminder_id: match.id, title: newTitle },
      conversationId
    );
    return { reply: `Cambié el recordatorio a "${newTitle}".`, action };
  }

  // "¿Qué recordatorios tengo?"
  if (/qu[eé]\s+recordatorios?\b/.test(lower)) {
    const action = await executeTool(ctx, "list_reminders", { status: "pending" }, conversationId);
    const reminders = (action.result as Array<{ title: string }>) ?? [];
    const reply =
      reminders.length === 0
        ? "No tienes recordatorios pendientes."
        : `Tus recordatorios: ${reminders.map((r) => r.title).join(", ")}.`;
    return { reply, action };
  }

  // "Asigna a papá revisar la piscina"
  const assignMatch = lower.match(/asigna(r)?\s+a\s+(\w+)\s+(.+)/);
  if (assignMatch) {
    const member = findMemberByName(members, assignMatch[2]);
    const action = await executeTool(
      ctx,
      "create_task",
      { title: assignMatch[3].trim(), assignee_ids: member ? [member.id] : [] },
      conversationId
    );
    return {
      reply: member
        ? `Le asigné a ${member.name} la tarea: "${assignMatch[3].trim()}".`
        : `Creé la tarea "${assignMatch[3].trim()}", pero no identifiqué a quién asignarla. ¿A quién se la asigno?`,
      action,
    };
  }

  // "Crea una tarea para limpiar la cocina" / "agrega una tarea de..." / "ingresa una tarea para..."
  // (genérica, sin asignar a nadie en particular)
  const createTaskMatch = lower.match(/^(?:crea(?:r)?|agrega(?:r)?|ingresa(?:r)?)\s+una\s+tarea\s+(?:para\s+|de\s+)?(.+)/);
  if (createTaskMatch) {
    const action = await executeTool(ctx, "create_task", { title: createTaskMatch[1].trim() }, conversationId);
    return { reply: `Creé la tarea "${createTaskMatch[1].trim()}".`, action };
  }

  // "Pospón la tarea de sacar la basura 15 minutos" / "posterga la tarea X una hora" / "reprograma la tarea X un día"
  const postponeTaskMatch = lower.match(
    /(?:pospo(?:n|ne)(?:r)?|posp[oó]n|posterga(?:r)?|reprograma(?:r)?)\s+la\s+tarea\s+(?:de\s+)?(.+?)\s+(\d+\s*(?:minutos?|horas?|d[ií]as?)|media\s+hora|una?\s+hora|un\s+d[ií]a)\s*$/
  );
  if (postponeTaskMatch) {
    const target = postponeTaskMatch[1].trim();
    const minutes = parseMinutesPhrase(postponeTaskMatch[2])!;
    const listAction = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
    const tasks = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(tasks, target, (t) => t.title);
    if (!match) {
      return { reply: `No encontré ninguna tarea pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "postpone_task", { task_id: match.id, minutes }, conversationId);
    return { reply: `Pospuse "${match.title}".`, action };
  }

  // "Cambia la fecha de la tarea de sacar la basura para mañana" / "reprograma la tarea X al viernes"
  const rescheduleTaskDateMatch = lower.match(
    /(?:cambia(?:r)?\s+la\s+fecha\s+de\s+|reprograma(?:r)?\s+)la\s+tarea\s+(?:de\s+)?(.+)/
  );
  if (rescheduleTaskDateMatch) {
    const rest = rescheduleTaskDateMatch[1];
    const date = parseRelativeDate(rest);
    if (date) {
      const target = rest.replace(/\s+(?:a|para|al)\s+.*$/i, "").trim();
      const listAction = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
      const tasks = (listAction.result as Array<{ id: string; title: string }>) ?? [];
      const match = findByName(tasks, target, (t) => t.title);
      if (!match) {
        return { reply: `No encontré ninguna tarea pendiente que coincida con "${target}".`, action: listAction };
      }
      const action = await executeTool(ctx, "update_task", { task_id: match.id, due_date: date }, conversationId);
      return { reply: `Cambié la fecha de "${match.title}" al ${date}.`, action };
    }
  }

  // "Cambia la hora de la tarea de sacar la basura a las 5"
  const rescheduleTaskTimeMatch = lower.match(/cambia(?:r)?\s+la\s+hora\s+de\s+la\s+tarea\s+(?:de\s+)?(.+)/);
  if (rescheduleTaskTimeMatch) {
    const rest = rescheduleTaskTimeMatch[1];
    const time = parseTimeOfDay(rest);
    if (!time) {
      return { reply: "¿A qué hora quieres cambiarla? Dime, por ejemplo 'a las 5 de la tarde'." };
    }
    const target = rest.replace(/\s+a\s+las?\s+.*$/i, "").trim();
    const listAction = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
    const tasks = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(tasks, target, (t) => t.title);
    if (!match) {
      return { reply: `No encontré ninguna tarea pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "update_task", { task_id: match.id, due_time: time }, conversationId);
    return { reply: `Cambié la hora de "${match.title}" a las ${time.slice(0, 5)}.`, action };
  }

  // "Cambia el título de la tarea de sacar la basura a sacar el reciclaje" / "renombra la tarea X a Y"
  const renameTaskMatch = lower.match(
    /(?:cambia(?:r)?\s+el\s+t[ií]tulo\s+de\s+la\s+tarea\s+(?:de\s+)?|renombra(?:r)?\s+la\s+tarea\s+(?:de\s+)?)(.+?)\s+a\s+(.+)/
  );
  if (renameTaskMatch) {
    const target = renameTaskMatch[1].trim();
    const newTitle = renameTaskMatch[2].trim();
    const listAction = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
    const tasks = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(tasks, target, (t) => t.title);
    if (!match) {
      return { reply: `No encontré ninguna tarea pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "update_task", { task_id: match.id, title: newTitle }, conversationId);
    return { reply: `Cambié el título de "${match.title}" a "${newTitle}".`, action };
  }

  // "Marca como completada la tarea de sacar la basura"
  const completeTaskMatch = lower.match(/marca(r)?\s+como\s+completada\s+(?:la\s+tarea\s+de\s+)?(.+)/);
  if (completeTaskMatch) {
    const listAction = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
    const tasks = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const target = completeTaskMatch[2].trim();
    const match = tasks.find(
      (t) => t.title.toLowerCase().includes(target) || target.includes(t.title.toLowerCase())
    );
    if (!match) {
      return { reply: `No encontré ninguna tarea pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "complete_task", { task_id: match.id }, conversationId);
    return { reply: `Marqué como completada: "${match.title}".`, action };
  }

  // "Elimina la tarea de sacar la basura" / "borra la tarea revisar la piscina"
  const deleteTaskMatch = lower.match(/(?:elimina(?:r)?|borra(?:r)?)\s+la\s+tarea\s+(?:de\s+)?(.+)/);
  if (deleteTaskMatch) {
    const target = deleteTaskMatch[1].trim();
    const listAction = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
    const tasks = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = tasks.find(
      (t) => t.title.toLowerCase().includes(target) || target.includes(t.title.toLowerCase())
    );
    if (!match) {
      return { reply: `No encontré ninguna tarea pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "delete_task", { task_id: match.id }, conversationId);
    return {
      reply:
        action.status === "pending_confirmation" ? action.confirmationMessage! : `Eliminé la tarea "${match.title}".`,
      action,
    };
  }

  // "¿Qué tareas están pendientes?"
  if (/qu[eé]\s+tareas\b.*pendiente/.test(lower)) {
    const action = await executeTool(ctx, "list_tasks", { status: "pending" }, conversationId);
    const tasks = (action.result as Array<{ title: string }>) ?? [];
    const reply =
      tasks.length === 0 ? "No hay tareas pendientes. ¡Buen trabajo!" : `Tareas pendientes: ${tasks.map((t) => t.title).join(", ")}.`;
    return { reply, action };
  }

  // "¿Qué tiene Martina mañana?" / "¿qué tenemos este fin de semana?"
  const memberSchedule = findMemberByName(members, lower);
  if (memberSchedule && /(qu[eé] tiene|agenda|actividades)/.test(lower)) {
    const date = parseRelativeDate(lower) ?? parseRelativeDate("hoy");
    const action = await executeTool(
      ctx,
      "list_events",
      { member_id: memberSchedule.id, from: `${date}T00:00:00`, to: `${date}T23:59:59` },
      conversationId
    );
    const events = (action.result as Array<{ title: string }>) ?? [];
    const reply =
      events.length === 0
        ? `${memberSchedule.name} no tiene actividades agendadas ese día.`
        : `${memberSchedule.name} tiene: ${events.map((e) => e.title).join(", ")}.`;
    return { reply, action };
  }

  // "¿Qué tenemos programado para mañana?" (de toda la familia, sin nombrar a nadie)
  if (/qu[eé]\s+(tenemos|hay)\s+(programado|agendado)/.test(lower)) {
    const date = parseRelativeDate(lower) ?? parseRelativeDate("hoy");
    const action = await executeTool(
      ctx,
      "list_events",
      { from: `${date}T00:00:00`, to: `${date}T23:59:59` },
      conversationId
    );
    const events = (action.result as Array<{ title: string }>) ?? [];
    const reply =
      events.length === 0 ? "No hay nada programado para ese día." : `Para ese día tienen: ${events.map((e) => e.title).join(", ")}.`;
    return { reply, action };
  }

  // "Crea un evento para el sábado a las diez de la mañana" / "agrega un evento..." / "ingresa un evento..."
  const createEventMatch = lower.match(/^(?:crea(?:r)?|agrega(?:r)?|ingresa(?:r)?)\s+un\s+evento\s+(?:de\s+)?(.+)/);
  if (createEventMatch) {
    const body = createEventMatch[1];
    const date = parseRelativeDate(body);
    if (!date) {
      return { reply: "¿Para qué día es el evento? Dime una fecha, por ejemplo 'el sábado' o 'mañana'." };
    }
    const time = parseTimeOfDay(body) ?? "09:00:00";
    const title =
      body
        .replace(/\ba\s+las?\s+.+$/i, "") // la hora y lo que venga después, siempre al final
        .replace(/\bpara\b/gi, "")
        .replace(
          /\b(el|la|del)?\s*(hoy|pasado\s*ma[ñn]ana|ma[ñn]ana|lunes|martes|mi[ée]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi,
          ""
        )
        .replace(/\s+/g, " ")
        .trim() || "Evento familiar";
    const action = await executeTool(ctx, "create_event", { title, start_at: `${date}T${time}` }, conversationId);
    return {
      reply: `Creé el evento "${title}" para el ${date} a las ${time.slice(0, 5)}. Si querías otro título, puedes editarlo en Calendario.`,
      action,
    };
  }

  // "Elimina el evento de cumpleaños de Martina" / "cancela el evento de la piscina"
  const deleteEventMatch = lower.match(
    /(?:elimina(?:r)?|borra(?:r)?|cancela(?:r)?)\s+el\s+evento\s+(?:de\s+)?(.+)/
  );
  if (deleteEventMatch) {
    const target = deleteEventMatch[1].trim();
    const now = new Date();
    const listAction = await executeTool(
      ctx,
      "list_events",
      { from: now.toISOString(), to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() },
      conversationId
    );
    const events = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = events.find(
      (e) => e.title.toLowerCase().includes(target) || target.includes(e.title.toLowerCase())
    );
    if (!match) {
      return { reply: `No encontré ningún evento próximo que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "delete_event", { event_id: match.id }, conversationId);
    return { reply: `Eliminé el evento "${match.title}".`, action };
  }

  // "Pospón el evento de la reunión 30 minutos" / "posterga el evento X una hora"
  const postponeEventMatch = lower.match(
    /(?:pospo(?:n|ne)(?:r)?|posp[oó]n|posterga(?:r)?)\s+el\s+evento\s+(?:de\s+)?(.+?)\s+(\d+\s*(?:minutos?|horas?|d[ií]as?)|media\s+hora|una?\s+hora|un\s+d[ií]a)\s*$/
  );
  if (postponeEventMatch) {
    const target = postponeEventMatch[1].trim();
    const minutes = parseMinutesPhrase(postponeEventMatch[2])!;
    const now = new Date();
    const listAction = await executeTool(
      ctx,
      "list_events",
      { from: now.toISOString(), to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() },
      conversationId
    );
    const events = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(events, target, (e) => e.title);
    if (!match) {
      return { reply: `No encontré ningún evento próximo que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "postpone_event", { event_id: match.id, minutes }, conversationId);
    return { reply: `Pospuse el evento "${match.title}".`, action };
  }

  // "Reprograma el evento de la reunión para mañana a las 5" / "cambia la fecha del evento X al viernes"
  const rescheduleEventMatch = lower.match(
    /(?:reprograma(?:r)?|cambia(?:r)?\s+la\s+fecha\s+del?)\s+(?:el\s+)?evento\s+(?:de\s+)?(.+)/
  );
  if (rescheduleEventMatch) {
    const rest = rescheduleEventMatch[1];
    const date = parseRelativeDate(rest);
    if (date) {
      const time = parseTimeOfDay(rest) ?? "09:00:00";
      const target = rest
        .replace(/\ba\s+las?\s+.+$/i, "")
        .replace(/\s+(?:para|al)\s+.*$/i, "")
        .trim();
      const now = new Date();
      const listAction = await executeTool(
        ctx,
        "list_events",
        { from: now.toISOString(), to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() },
        conversationId
      );
      const events = (listAction.result as Array<{ id: string; title: string }>) ?? [];
      const match = findByName(events, target, (e) => e.title);
      if (!match) {
        return { reply: `No encontré ningún evento próximo que coincida con "${target}".`, action: listAction };
      }
      const action = await executeTool(
        ctx,
        "update_event",
        { event_id: match.id, start_at: `${date}T${time}` },
        conversationId
      );
      return { reply: `Reprogramé "${match.title}" para el ${date} a las ${time.slice(0, 5)}.`, action };
    }
  }

  // "Cambia el título del evento de la reunión a junta de apoderados" / "cambia el lugar del evento X a Y"
  const editEventMatch = lower.match(
    /cambia(?:r)?\s+el\s+(t[ií]tulo|lugar)\s+del?\s+evento\s+(?:de\s+)?(.+?)\s+a\s+(.+)/
  );
  if (editEventMatch) {
    const field = editEventMatch[1];
    const target = editEventMatch[2].trim();
    const newValue = editEventMatch[3].trim();
    const now = new Date();
    const listAction = await executeTool(
      ctx,
      "list_events",
      { from: now.toISOString(), to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() },
      conversationId
    );
    const events = (listAction.result as Array<{ id: string; title: string }>) ?? [];
    const match = findByName(events, target, (e) => e.title);
    if (!match) {
      return { reply: `No encontré ningún evento próximo que coincida con "${target}".`, action: listAction };
    }
    const params = field.startsWith("t") ? { title: newValue } : { location: newValue };
    const action = await executeTool(ctx, "update_event", { event_id: match.id, ...params }, conversationId);
    return {
      reply:
        field.startsWith("t")
          ? `Cambié el título a "${newValue}".`
          : `Cambié el lugar de "${match.title}" a "${newValue}".`,
      action,
    };
  }

  // "¿Qué falta comprar?" / "¿qué tenemos que comprar?"
  if (/falta comprar|qu[eé] (tenemos|hay) que comprar|lista de compras/.test(lower)) {
    const action = await executeTool(ctx, "list_shopping_items", { status: "pending" }, conversationId);
    const items = (action.result as Array<{ name: string }>) ?? [];
    const reply =
      items.length === 0
        ? "No tienes productos pendientes en la lista de compras."
        : `Falta comprar: ${items.map((i) => i.name).join(", ")}.`;
    return { reply, action };
  }

  // "¿Cuánto hemos gastado este mes?"
  if (/cu[aá]nto.*gastado|cu[aá]nto.*gastamos/.test(lower)) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const action = await executeTool(ctx, "query_expenses_summary", { from, to }, conversationId);
    const data = action.result as { total: number } | undefined;
    return { reply: `Este mes han gastado ${money(data?.total ?? 0)}.`, action };
  }

  // "¿Qué tengo hoy?" / "¿qué tengo que hacer ahora?" / "¿qué tenemos pendiente?"
  if (/qu[eé] (tengo|tenemos|debería|deberia).*(hoy|ahora|pendiente|hacer)/.test(lower)) {
    const summary = await buildTodaySummary(ctx.familyId);
    if (summary.priorities.length === 0) {
      return { reply: "No tienes tareas urgentes pendientes. ¡Buen día!" };
    }
    const top = summary.priorities.slice(0, 3).map((p) => p.title);
    return {
      reply: `Tienes ${summary.pendingTasksCount} tarea${summary.pendingTasksCount === 1 ? "" : "s"} pendiente${summary.pendingTasksCount === 1 ? "" : "s"}. Lo más importante: ${top.join("; ")}.`,
    };
  }

  // "¿Qué cuentas tengo pendientes?" / "cuentas por pagar"
  if (/cuentas?\s+(pendientes?|por\s+pagar)|qu[eé]\s+cuentas?\s+(tengo|hay|debo)/.test(lower)) {
    const action = await executeTool(ctx, "list_bills", { status: "pending" }, conversationId);
    const bills = (action.result as Array<{ name: string; amount: string; due_date: string }>) ?? [];
    const reply =
      bills.length === 0
        ? "No tienes cuentas pendientes."
        : `Cuentas pendientes: ${bills.map((b) => `${b.name} (${money(Number(b.amount))}, vence ${b.due_date})`).join("; ")}.`;
    return { reply, action };
  }

  // "Agrega la cuenta de luz por $50.000 que vence el 10" / "ingresa la cuenta de internet, 20 mil, vence mañana"
  const createBillMatch = lower.match(
    /(?:agrega(?:r)?|ingresa(?:r)?|registra(?:r)?)\s+la\s+cuenta\s+(?:de|del)\s+(.+)/
  );
  if (createBillMatch) {
    const rest = createBillMatch[1];
    const amount = parseAmount(rest);
    const date = parseRelativeDate(rest);
    if (amount && date) {
      const name = rest
        .replace(/\bpor\b/gi, "")
        .replace(/\$?\s*\d[\d.,]*\s*(mil\s*(pesos|lucas)?|pesos)?/gi, "")
        .replace(/\b(que\s+)?vence\s+(el\s+)?.*/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const billName = name || rest.trim();
      const action = await executeTool(
        ctx,
        "create_bill",
        { name: billName, amount, due_date: date },
        conversationId
      );
      return { reply: `Agregué la cuenta de "${billName}" por ${money(amount)}, vence el ${date}.`, action };
    }
    return {
      reply:
        "Necesito el monto y la fecha de vencimiento, por ejemplo: \"agrega la cuenta de luz por $50.000 que vence el 10\".",
    };
  }

  // "Paga la cuenta de luz" / "marca como pagada la cuenta de agua"
  const payBillMatch = lower.match(/(?:paga(?:r)?|marca(?:r)?\s+como\s+pagada)\s+la\s+cuenta\s+(?:de|del)\s+(.+)/);
  if (payBillMatch) {
    const target = payBillMatch[1].trim();
    const listAction = await executeTool(ctx, "list_bills", { status: "pending" }, conversationId);
    const bills = (listAction.result as Array<{ id: string; name: string }>) ?? [];
    const match = findByName(bills, target, (b) => b.name);
    if (!match) {
      return { reply: `No encontré ninguna cuenta pendiente que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "pay_bill", { bill_id: match.id }, conversationId);
    return {
      reply:
        action.status === "pending_confirmation"
          ? action.confirmationMessage!
          : `Marqué "${match.name}" como pagada.`,
      action,
    };
  }

  // "Elimina la cuenta de luz" / "borra la cuenta del agua" / "cancela la cuenta de internet"
  const deleteBillMatch = lower.match(
    /(?:elimina(?:r)?|borra(?:r)?|cancela(?:r)?)\s+la\s+cuenta\s+(?:de|del)\s+(.+)/
  );
  if (deleteBillMatch) {
    const target = deleteBillMatch[1].trim();
    const listAction = await executeTool(ctx, "list_bills", {}, conversationId);
    const bills = (listAction.result as Array<{ id: string; name: string }>) ?? [];
    const match = bills.find(
      (b) => b.name.toLowerCase().includes(target) || target.includes(b.name.toLowerCase())
    );
    if (!match) {
      return { reply: `No encontré ninguna cuenta que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "delete_bill", { bill_id: match.id }, conversationId);
    return {
      reply:
        action.status === "pending_confirmation" ? action.confirmationMessage! : `Eliminé la cuenta "${match.name}".`,
      action,
    };
  }

  // "¿Qué mantenimientos están pendientes?" (listado general, antes de la consulta por nombre)
  if (/qu[eé]\s+mantenci(o|ó)n(es)?\b.*pendiente/.test(lower)) {
    const action = await executeTool(ctx, "list_maintenance", {}, conversationId);
    const items = (action.result as Array<{ name: string; next_maintenance_at: string | null }>) ?? [];
    const pending = items.filter((i) => i.next_maintenance_at);
    const reply =
      pending.length === 0
        ? "No hay mantenciones con próxima fecha programada."
        : `Mantenciones pendientes: ${pending.map((i) => `${i.name} (${i.next_maintenance_at})`).join(", ")}.`;
    return { reply, action };
  }

  // "¿Cuándo toca revisar el calefont?"
  const maintenanceMatch = lower.match(/cu[aá]ndo.*(revisar|mantenci[oó]n)\s+(?:el|la|los|las)?\s*(.+)/);
  if (maintenanceMatch) {
    const action = await executeTool(ctx, "list_maintenance", {}, conversationId);
    const items = (action.result as Array<{ name: string; next_maintenance_at: string | null }>) ?? [];
    const match = items.find((i) => i.name.toLowerCase().includes(maintenanceMatch[2].trim()));
    return {
      reply: match
        ? match.next_maintenance_at
          ? `La próxima mantención de ${match.name} es el ${match.next_maintenance_at}.`
          : `${match.name} no tiene una próxima mantención programada.`
        : "No encontré ese equipo registrado en Casa en Orden.",
      action,
    };
  }

  // "Agrega una mantención para la piscina" / "ingresa la mantención del calefont cada 90 días"
  const createMaintenanceMatch = lower.match(
    /(?:agrega(?:r)?|ingresa(?:r)?|registra(?:r)?)\s+(?:una\s+)?mantenci[oó]n\s+(?:para|de|del)\s+(?:el\s+|la\s+)?(.+)/
  );
  if (createMaintenanceMatch) {
    const rest = createMaintenanceMatch[1];
    const date = parseRelativeDate(rest);
    const frequencyMatch = rest.match(/cada\s+(\d+)\s*d[ií]as?/);
    const name = rest
      .replace(/\bcada\s+\d+\s*d[ií]as?\b/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const billName = name || rest.trim();
    const action = await executeTool(
      ctx,
      "create_maintenance",
      {
        name: billName,
        next_maintenance_at: date ?? undefined,
        frequency_days: frequencyMatch ? parseInt(frequencyMatch[1], 10) : undefined,
      },
      conversationId
    );
    return { reply: `Agregué "${billName}" a las mantenciones de la casa.`, action };
  }

  // "Elimina la mantención de la piscina" / "borra la mantención del calefont"
  const deleteMaintenanceMatch = lower.match(
    /(?:elimina(?:r)?|borra(?:r)?)\s+la\s+mantenci[oó]n\s+(?:de|del)\s+(.+)/
  );
  if (deleteMaintenanceMatch) {
    const target = deleteMaintenanceMatch[1].trim();
    const listAction = await executeTool(ctx, "list_maintenance", {}, conversationId);
    const items = (listAction.result as Array<{ id: string; name: string }>) ?? [];
    const match = findByName(items, target, (i) => i.name);
    if (!match) {
      return { reply: `No encontré ninguna mantención que coincida con "${target}".`, action: listAction };
    }
    const action = await executeTool(ctx, "delete_maintenance", { maintenance_id: match.id }, conversationId);
    return {
      reply:
        action.status === "pending_confirmation"
          ? action.confirmationMessage!
          : `Eliminé la mantención de "${match.name}".`,
      action,
    };
  }

  return {
    reply:
      "No entendí ese pedido. Puedo ayudarte con cosas como: crear, completar, posponer, reprogramar, renombrar o eliminar tareas, eventos y recordatorios; agregar, quitar o consultar productos de la lista de compras; registrar, consultar o eliminar gastos; agregar, pagar o eliminar cuentas del hogar; y agregar, consultar o eliminar mantenciones. Intenta decírmelo con esas palabras.",
  };
}
