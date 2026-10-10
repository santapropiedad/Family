import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { buildSpokenSummary } from "@/services/insights";

/** Resúmenes "Buenos días" / "Resumen nocturno" en texto, listos para leerse en voz alta. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    const mode = new URL(req.url).searchParams.get("mode");
    if (mode !== "morning" && mode !== "night") {
      throw new AppError("mode debe ser 'morning' o 'night'.", 400, "invalid_mode");
    }
    const text = await buildSpokenSummary(session.familyId, mode);
    return { text };
  });
}
