import { handleRoute } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { getVapidPublicKey } from "@/services/push";

export async function GET() {
  return handleRoute(async () => {
    await requireSession();
    return { publicKey: getVapidPublicKey() };
  });
}
