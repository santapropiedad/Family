import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { checkTaskAlarms } from "@/services/alarms";

/** Disparado por polling del cliente (cada ~60s) mientras la app está abierta. */
export async function POST() {
  return handleRoute(async () => {
    const session = await requireSession();
    const notifications = await checkTaskAlarms(session.familyId);
    return { notifications };
  });
}
