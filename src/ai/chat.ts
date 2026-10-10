import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import type { ToolContext } from "@/ai/tools";
import { isClaudeConfigured, runClaudeTurn } from "@/ai/claude";
import { handleWithRules } from "@/ai/rules";
import type { ExecuteResult } from "@/ai/executor";

export async function getOrCreateConversation(familyId: string, memberId: string): Promise<string> {
  const db = await getDb();
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM ai_conversations WHERE family_id = $1 AND family_member_id = $2 ORDER BY updated_at DESC LIMIT 1`,
    [familyId, memberId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = newId();
  await db.query(`INSERT INTO ai_conversations (id, family_id, family_member_id) VALUES ($1, $2, $3)`, [
    id,
    familyId,
    memberId,
  ]);
  return id;
}

async function appendMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const db = await getDb();
  await db.query(`INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)`, [
    newId(),
    conversationId,
    role,
    content,
  ]);
  await db.query(`UPDATE ai_conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
}

async function getHistory(
  conversationId: string,
  limit = 20
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const db = await getDb();
  const result = await db.query<{ role: "user" | "assistant"; content: string }>(
    `SELECT role, content FROM ai_messages WHERE conversation_id = $1 AND role IN ('user','assistant')
     ORDER BY created_at ASC LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows;
}

export interface ChatResult {
  conversationId: string;
  reply: string;
  pendingActions: ExecuteResult[];
  mode: "claude" | "rules";
}

/** Punto de entrada único para texto y voz: persiste la conversación y responde usando Claude o el motor de reglas. */
export async function sendChatMessage(ctx: ToolContext, text: string): Promise<ChatResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new AppError("Escribe o di algo para que pueda ayudarte.", 400, "empty_message");

  const conversationId = await getOrCreateConversation(ctx.familyId, ctx.actorMemberId);
  await appendMessage(conversationId, "user", trimmed);

  if (isClaudeConfigured()) {
    const history = await getHistory(conversationId);
    const { reply, pendingActions } = await runClaudeTurn(ctx, conversationId, history);
    await appendMessage(conversationId, "assistant", reply);
    return { conversationId, reply, pendingActions, mode: "claude" };
  }

  const { reply, action } = await handleWithRules(ctx, trimmed, conversationId);
  await appendMessage(conversationId, "assistant", reply);
  return {
    conversationId,
    reply,
    pendingActions: action?.status === "pending_confirmation" ? [action] : [],
    mode: "rules",
  };
}
