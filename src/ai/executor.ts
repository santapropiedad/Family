import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { ForbiddenError, AppError } from "@/lib/errors";
import { hasCapability } from "@/lib/permissions";
import { getTool, type ToolContext } from "@/ai/tools";

export interface ExecuteResult {
  status: "executed" | "pending_confirmation" | "rejected";
  actionId: string;
  toolName: string;
  result?: unknown;
  error?: string;
  /** Human-readable description of what will happen, shown while awaiting confirmation. */
  confirmationMessage?: string;
}

/**
 * Único punto de entrada para que la IA ejecute acciones. Aplica, en este orden:
 * 1) verificación de permisos según el rol del integrante,
 * 2) nivel de confirmación (auto / confirm / always_confirm),
 * 3) registro en ai_actions y audit_logs para trazabilidad.
 * Las acciones que requieren confirmación NUNCA se ejecutan aquí: quedan en
 * estado pending_confirmation hasta que un endpoint separado (confirmado por
 * el usuario, no por el modelo) las ejecute.
 */
export async function executeTool(
  ctx: ToolContext,
  toolName: string,
  params: Record<string, unknown>,
  conversationId?: string | null
): Promise<ExecuteResult> {
  const db = await getDb();
  const tool = getTool(toolName);
  const actionId = newId();

  if (tool.requiredCapability && !hasCapability(ctx.actorRole, tool.requiredCapability)) {
    await db.query(
      `INSERT INTO ai_actions (id, family_id, family_member_id, conversation_id, tool_name, parameters, confirmation_level, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed', $8)`,
      [
        actionId,
        ctx.familyId,
        ctx.actorMemberId,
        conversationId ?? null,
        toolName,
        JSON.stringify(params),
        tool.confirmationLevel,
        "forbidden",
      ]
    );
    throw new ForbiddenError(
      "No tengo permiso para hacer eso con tu rol actual. Pídele a un adulto o administrador que lo haga."
    );
  }

  if (tool.confirmationLevel !== "auto") {
    await db.query(
      `INSERT INTO ai_actions (id, family_id, family_member_id, conversation_id, tool_name, parameters, confirmation_level, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_confirmation')`,
      [actionId, ctx.familyId, ctx.actorMemberId, conversationId ?? null, toolName, JSON.stringify(params), tool.confirmationLevel]
    );
    return {
      status: "pending_confirmation",
      actionId,
      toolName,
      confirmationMessage: describePendingAction(toolName, params),
    };
  }

  try {
    const result = await tool.handler(ctx, params);
    await db.query(
      `INSERT INTO ai_actions (id, family_id, family_member_id, conversation_id, tool_name, parameters, confirmation_level, status, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'executed', $8)`,
      [
        actionId,
        ctx.familyId,
        ctx.actorMemberId,
        conversationId ?? null,
        toolName,
        JSON.stringify(params),
        tool.confirmationLevel,
        JSON.stringify(result ?? null),
      ]
    );
    await logAudit(ctx, "ai_tool_executed", toolName, actionId);
    return { status: "executed", actionId, toolName, result };
  } catch (err) {
    const message = err instanceof AppError ? err.message : "No pude completar esa acción.";
    await db.query(
      `INSERT INTO ai_actions (id, family_id, family_member_id, conversation_id, tool_name, parameters, confirmation_level, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed', $8)`,
      [actionId, ctx.familyId, ctx.actorMemberId, conversationId ?? null, toolName, JSON.stringify(params), tool.confirmationLevel, message]
    );
    throw err;
  }
}

interface PendingAction {
  id: string;
  family_id: string;
  family_member_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  status: string;
}

export async function getPendingAction(familyId: string, actionId: string): Promise<PendingAction> {
  const db = await getDb();
  const result = await db.query<PendingAction>(
    "SELECT * FROM ai_actions WHERE family_id = $1 AND id = $2 AND status = 'pending_confirmation'",
    [familyId, actionId]
  );
  if (result.rows.length === 0) {
    throw new AppError("No hay ninguna acción pendiente de confirmación con ese identificador.", 404, "not_found");
  }
  return result.rows[0];
}

/** Ejecuta una acción que estaba esperando confirmación explícita del usuario (nunca del modelo). */
export async function confirmPendingAction(ctx: ToolContext, actionId: string): Promise<ExecuteResult> {
  const db = await getDb();
  const pending = await getPendingAction(ctx.familyId, actionId);
  const tool = getTool(pending.tool_name);

  if (tool.requiredCapability && !hasCapability(ctx.actorRole, tool.requiredCapability)) {
    throw new ForbiddenError("No tienes permiso para confirmar esta acción.");
  }

  try {
    const result = await tool.handler(ctx, pending.parameters);
    await db.query(
      `UPDATE ai_actions SET status = 'executed', result = $3 WHERE id = $1 AND family_id = $2`,
      [actionId, ctx.familyId, JSON.stringify(result ?? null)]
    );
    await logAudit(ctx, "ai_tool_confirmed", pending.tool_name, actionId);
    return { status: "executed", actionId, toolName: pending.tool_name, result };
  } catch (err) {
    const message = err instanceof AppError ? err.message : "No pude completar esa acción.";
    await db.query(`UPDATE ai_actions SET status = 'failed', error_message = $3 WHERE id = $1 AND family_id = $2`, [
      actionId,
      ctx.familyId,
      message,
    ]);
    throw err;
  }
}

export async function rejectPendingAction(ctx: ToolContext, actionId: string): Promise<void> {
  await getPendingAction(ctx.familyId, actionId);
  const db = await getDb();
  await db.query(`UPDATE ai_actions SET status = 'rejected' WHERE id = $1 AND family_id = $2`, [
    actionId,
    ctx.familyId,
  ]);
  await logAudit(ctx, "ai_tool_rejected", "", actionId);
}

async function logAudit(ctx: ToolContext, action: string, toolName: string, entityId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO audit_logs (id, family_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'ai', $3, $4, 'ai_actions', $5, $6)`,
    [newId(), ctx.familyId, ctx.actorMemberId, action, entityId, JSON.stringify({ toolName })]
  );
}

function describePendingAction(toolName: string, params: Record<string, unknown>): string {
  switch (toolName) {
    case "pay_bill":
      return "¿Confirmas que quieres marcar esta cuenta como pagada y registrar el gasto?";
    case "delete_task":
      return "¿Confirmas que quieres eliminar esta tarea? Esta acción no se puede deshacer.";
    case "delete_event":
      return "¿Confirmas que quieres eliminar este evento? Esta acción no se puede deshacer.";
    default:
      return `¿Confirmas que quieres realizar esta acción? (${toolName}: ${JSON.stringify(params)})`;
  }
}
