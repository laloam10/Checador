// Service worker de Checador.
// - Estáticos (/_next/static, íconos): cache primero.
// - Páginas: red primero; sin red, la última versión guardada.
// - /api: nunca se guarda (las checadas sin conexión las maneja la cola en IndexedDB).
const VERSION = "v3"; // súbela cuando cambien los íconos (se guardan con el mismo nombre)
const CACHE = `checador-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Avisos (Web Push). El contenido lo arma el servidor sin horas ni datos personales.
self.addEventListener("push", (event) => {
  let aviso = { titulo: "Checador", cuerpo: "Tienes algo pendiente en Checador.", url: "/", etiqueta: "checador" };
  try {
    aviso = { ...aviso, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: aviso.etiqueta,
      data: { url: aviso.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Solo rutas propias: nunca se abre un sitio externo desde un aviso.
  const ruta = typeof event.notification.data?.url === "string" && /^\/(?![/\\])/.test(event.notification.data.url) ? event.notification.data.url : "/";
  const destino = new URL(ruta, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin));
      if (abierta) return abierta.navigate(destino).then((v) => (v || abierta).focus());
      return self.clients.openWindow(destino);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || /^\/icon-.*\.png$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Solo se guardan páginas propias, no redirecciones (p. ej. a /entrar).
          if (res.ok && !res.redirected) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/")).then(
            (hit) =>
              hit ||
              new Response("<h1>Sin conexión</h1><p>Abre Checador cuando tengas internet al menos una vez.</p>", {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              }),
          ),
        ),
    );
  }
});
