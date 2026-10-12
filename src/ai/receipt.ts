import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/errors";

export interface ExtractedReceipt {
  merchant: string | null;
  spentAt: string | null;
  amount: number;
  categoryName: string | null;
  description: string | null;
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_receipt",
  description: "Entrega los datos extraídos de la boleta o recibo de compra en la imagen.",
  input_schema: {
    type: "object",
    properties: {
      merchant: { type: "string", description: "Nombre del supermercado o comercio, si aparece." },
      spent_at: { type: "string", description: "Fecha de la compra en formato YYYY-MM-DD, si aparece." },
      amount: { type: "number", description: "Monto TOTAL pagado en pesos chilenos (CLP), solo el número." },
      category_name: {
        type: "string",
        description:
          "Una de: Alimentación, Vivienda, Servicios, Transporte, Educación, Salud, Niños, Entretenimiento, Compras, Mascotas, Otros.",
      },
      description: { type: "string", description: "Resumen muy breve de la compra (ej. 'Compra en Jumbo')." },
    },
    required: ["amount"],
  },
};

/** Envía la foto de una boleta a Claude (visión) y devuelve los datos estructurados para registrar el gasto. */
export async function scanReceiptImage(imageBase64: string, mimeType: string): Promise<ExtractedReceipt> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError(
      "Escanear boletas requiere que el administrador configure ANTHROPIC_API_KEY. Mientras tanto, registra el gasto manualmente.",
      400,
      "ai_not_configured"
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_receipt" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: "Esta es una foto de una boleta de supermercado o comercio. Extrae el monto total, el comercio, la fecha y la categoría usando la herramienta.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "extract_receipt"
  );
  if (!toolUse) {
    throw new AppError("No se pudo leer la boleta. Intenta con una foto más clara.", 422, "receipt_unreadable");
  }

  const input = toolUse.input as Record<string, unknown>;
  const amount = Number(input.amount);
  if (!amount || amount <= 0) {
    throw new AppError("No se pudo identificar el monto total de la boleta.", 422, "receipt_unreadable");
  }

  return {
    merchant: typeof input.merchant === "string" ? input.merchant : null,
    spentAt: typeof input.spent_at === "string" ? input.spent_at : null,
    amount,
    categoryName: typeof input.category_name === "string" ? input.category_name : null,
    description: typeof input.description === "string" ? input.description : null,
  };
}
