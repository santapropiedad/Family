import { api } from "@/lib/api-client";

/** Web Push exige la clave pública del servidor en bytes, no en el texto base64url que viaja por la red. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Suscribe este dispositivo a Web Push y registra la suscripción en el backend. Silencioso si
 * el navegador no soporta push o si el servidor no tiene VAPID configurado (p. ej. en desarrollo
 * local antes de desplegar) — la app sigue funcionando con el polling normal en ese caso.
 */
export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const { publicKey } = await api.get<{ publicKey: string | null }>("/api/push/vapid-public-key");
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await api.post("/api/push/subscribe", subscription.toJSON());
  } catch {
    /* Suscribirse a push es un plus, nunca debe romper el resto de la app. */
  }
}
