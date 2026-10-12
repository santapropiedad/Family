import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, type ToolContext } from "@/ai/tools";
import { executeTool, type ExecuteResult } from "@/ai/executor";

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `Eres FAMILY IA, el asistente familiar de la aplicación Family. Hablas español de Chile,
de forma cálida, breve y directa. Ayudas a administrar tareas, compras, gastos, calendario, mantenciones
de la casa y recordatorios de una familia.

Reglas importantes:
- Nunca inventes datos financieros ni de la familia: usa siempre las herramientas para consultar o modificar información real.
- Si falta un dato importante (quién es el responsable, cuándo es, cuánto costó), pregunta antes de ejecutar la acción.
- Si una herramienta devuelve que la acción quedó pendiente de confirmación, explícaselo al usuario de forma breve y espera su confirmación explícita antes de asumir que se hizo.
- Sé breve: 1 a 3 frases por respuesta, como si hablaras, no como si escribieras un informe.`;

export interface ChatTurnResult {
  reply: string;
  pendingActions: ExecuteResult[];
}

/** Ejecuta un turno de conversación completo con Claude, incluyendo el loop de uso de herramientas. */
export async function runClaudeTurn(
  ctx: ToolContext,
  conversationId: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<ChatTurnResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const pendingActions: ExecuteResult[] = [];

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const textBlocks = response.content.filter((block): block is Anthropic.TextBlock => block.type === "text");

    if (toolUseBlocks.length === 0) {
      return { reply: textBlocks.map((b) => b.text).join("\n").trim(), pendingActions };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      try {
        const result = await executeTool(
          ctx,
          block.name,
          (block.input as Record<string, unknown>) ?? {},
          conversationId
        );
        if (result.status === "pending_confirmation") pendingActions.push(result);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            result.status === "pending_confirmation"
              ? { status: "pending_confirmation", message: result.confirmationMessage, action_id: result.actionId }
              : { status: "executed", result: result.result }
          ),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: err instanceof Error ? err.message : "Error ejecutando la herramienta.",
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: "Tuve problemas para completar tu solicitud después de varios intentos. ¿Puedes reformularla?",
    pendingActions,
  };
}
