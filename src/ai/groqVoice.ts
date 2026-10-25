import { AppError } from "@/lib/errors";

/**
 * Transcripción de voz (STT) vía Groq (Whisper), usada solo por el botón del micrófono del
 * asistente. El cerebro del asistente (interpretar el comando y ejecutar acciones) sigue
 * siendo Claude (ver @/ai/claude.ts); esto solo convierte el audio grabado en texto.
 */
export function isGroqVoiceConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function transcribeWithGroq(audio: Blob, filename: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "La transcripción por voz con Groq no está configurada (falta GROQ_API_KEY).",
      503,
      "groq_not_configured"
    );
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "es");
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AppError(
      `No pude transcribir el audio con Groq (${res.status}).${detail ? ` ${detail.slice(0, 200)}` : ""}`,
      502,
      "groq_transcription_failed"
    );
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
