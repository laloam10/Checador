// Service worker de Checador.
// - Estáticos (/_next/static, íconos): cache primero.
// - Páginas: red primero; sin red, la última versión guardada.
// - /api: nunca se guarda (las checadas sin conexión las maneja la cola en IndexedDB).
const VERSION = "v3"; // súbela cuando cambien los íconos (se guardan con el mismo nombre)
const CACHE = `checador-${VERSION}`;

// Página cuando no hay red ni una copia guardada de la pantalla (estilos en línea: no hay CSS sin red).
const SIN_CONEXION = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checador · Sin conexión</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f8ec;color:#13280a;font-family:system-ui,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:24rem;margin:1rem;padding:2rem 1.5rem;background:#fbfcf7;border:1px solid #dfe6cf;border-radius:1rem;text-align:center">
<div style="width:44px;height:44px;margin:0 auto 1rem;border-radius:12px;background:#0a2103;display:grid;place-items:center"><span style="width:14px;height:14px;border-radius:4px;background:#c8e600"></span></div>
<h1 style="font-size:1.35rem;margin:0 0 .5rem">Sin conexión</h1>
<p style="color:#4b5a40;margin:0 0 1.2rem">Abre Checador cuando tengas internet al menos una vez. Después, si te quedas sin señal, tus checadas se guardan en el teléfono y se envían solas al volver la conexión.</p>
<button onclick="location.reload()" style="background:#2f6e10;color:#fff;border:none;border-radius:10px;padding:.7rem 1.2rem;font-weight:600;font-size:1rem">Intentar de nuevo</button>
</div></body></html>`;

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
              new Response(SIN_CONEXION, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
          ),
        ),
    );
  }
});
