import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { getDb } from "@/db/client";

/** Registro de actividad de la IA (qué hizo, cuándo, con qué resultado) — visible en Familia. */
export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    const db = await getDb();
    const result = await db.query(
      `SELECT a.id, a.tool_name, a.parameters, a.confirmation_level, a.status, a.result, a.error_message, a.created_at,
              fm.name AS member_name
       FROM ai_actions a JOIN family_members fm ON fm.id = a.family_member_id
       WHERE a.family_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
      [session.familyId]
    );
    return { actions: result.rows };
  });
}
