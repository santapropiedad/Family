import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import type { PushSubscriptionRow } from "@/types/domain";

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface SavePushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Guarda (o reemplaza, si el navegador reutiliza el mismo endpoint) la suscripción de un dispositivo. */
export async function savePushSubscription(
  familyId: string,
  familyMemberId: string,
  input: SavePushSubscriptionInput
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO push_subscriptions (id, family_id, family_member_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET family_member_id = $3, p256dh = $5, auth = $6`,
    [newId(), familyId, familyMemberId, input.endpoint, input.keys.p256dh, input.keys.auth]
  );
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

export async function listPushSubscriptionsForFamily(familyId: string): Promise<PushSubscriptionRow[]> {
  const db = await getDb();
  const result = await db.query<PushSubscriptionRow>(
    "SELECT * FROM push_subscriptions WHERE family_id = $1",
    [familyId]
  );
  return result.rows;
}

export async function listPushSubscriptionsForMember(familyMemberId: string): Promise<PushSubscriptionRow[]> {
  const db = await getDb();
  const result = await db.query<PushSubscriptionRow>(
    "SELECT * FROM push_subscriptions WHERE family_member_id = $1",
    [familyMemberId]
  );
  return result.rows;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  tag?: string;
}

/**
 * Envía un push a una suscripción. Si el navegador la dio de baja (410/404, el caso típico
 * cuando el usuario desinstaló la PWA o borró datos del sitio), la elimina silenciosamente
 * en vez de reintentar para siempre.
 */
export async function sendPushToSubscription(sub: PushSubscriptionRow, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const webpush = await import("web-push");
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "no-reply@familiaplus.local"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await removePushSubscription(sub.endpoint);
    } else {
      console.error("[push] error enviando notificación:", err);
    }
  }
}

/** Envía un push a todas las suscripciones de un integrante, o a toda la familia si no se indica uno. */
export async function sendPushForNotification(
  familyId: string,
  familyMemberId: string | null,
  payload: PushPayload
): Promise<void> {
  if (!isPushConfigured()) return;
  const subs = familyMemberId
    ? await listPushSubscriptionsForMember(familyMemberId)
    : await listPushSubscriptionsForFamily(familyId);
  await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload)));
}
