import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkAllFamiliesTaskAlarms } from "@/services/alarms";

/**
 * Pensado para ser llamado por un scheduler externo (ej. cron-job.org) cada 1-5 minutos,
 * NO por el navegador. Protegido por CRON_SECRET: sin el secreto correcto, no revisa nada.
 * El plan gratuito de Vercel solo permite cron propio una vez al día (insuficiente para
 * avisar 15 min antes / 10 min después), por eso el disparador es externo y gratuito.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado." }, { status: 500 });
  }
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const sent = await checkAllFamiliesTaskAlarms();
    return NextResponse.json({ ok: true, notificationsSent: sent });
  } catch (err) {
    console.error("[cron/check-alarms] error:", err);
    return NextResponse.json({ error: "Error revisando alarmas." }, { status: 500 });
  }
}
