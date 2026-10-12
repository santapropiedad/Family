// Service worker mínimo: habilita la instalación como PWA.
// Deliberadamente NO cachea páginas ni datos de la API (son por-familia y cambian
// constantemente), para evitar mostrar información desactualizada o de otra familia.
const CACHE_NAME = "familia-plus-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", () => {
  // Passthrough intencional: siempre red, nunca caché, para datos siempre frescos.
});

// Muestra el aviso push aunque la app esté cerrada. El payload lo arma
// src/services/push.ts: { title, body, tag }.
self.addEventListener("push", (event) => {
  let data = { title: "Familia+", body: "Tienes un aviso nuevo." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload no era JSON válido; se usa el texto por defecto.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body ?? undefined,
      tag: data.tag,
      icon: "/icon",
      badge: "/icon",
    })
  );
});

// Al tocar el aviso, enfoca una pestaña ya abierta de la app o abre una nueva en "Hoy".
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
