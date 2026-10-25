import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { transcribeWithGroq } from "@/ai/groqVoice";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "ai:use");

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw new AppError("Falta el audio a transcribir.", 400, "missing_audio");
    }

    const text = await transcribeWithGroq(audio, "comando.webm");
    if (!text) {
      throw new AppError("No escuché nada, intenta de nuevo.", 400, "empty_transcription");
    }
    return { text };
  });
}
