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
