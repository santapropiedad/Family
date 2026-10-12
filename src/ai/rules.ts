import type { ToolContext } from "@/ai/tools";
import { executeTool, type ExecuteResult } from "@/ai/executor";
import { parseAmount, parseQuantityItem, parseRecurrence, parseRelativeDate } from "@/ai/parsing";
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
        reply: `Listo. Registré la compra de ${buyMatch[1].trim()} por ${money(amount)}, actualicé el inventario y la quité de la lista si estaba pendiente.`,
        action,
      };
    }
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
      return { reply: `Registré un gasto de ${money(amount)} en ${spendMatch[2].trim()}.`, action };
    }
  }

  // "Agrega leche" / "agrega tres kilos de arroz" / "agrega leche a las compras" /
  // "agrega leche a la lista del supermercado" / "agrega pan a la feria"
  if (/^agrega(r)?\b/.test(lower)) {
    const withoutVerb = lower.replace(/^agrega(r)?\s+/, "");
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

  // "Recuérdame comprar pan mañana" / "recuérdame pagar internet todos los meses"
  const reminderMatch = lower.match(/record(a|á)rme\s+(.+)/);
  if (reminderMatch) {
    const body = reminderMatch[2];
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

  return {
    reply:
      "No configuré una clave de Anthropic (ANTHROPIC_API_KEY), así que por ahora solo entiendo comandos simples: agregar compras, registrar gastos, crear recordatorios, asignar tareas y consultar lo pendiente. Para conversación libre, agrega la clave en .env.local.",
  };
}
