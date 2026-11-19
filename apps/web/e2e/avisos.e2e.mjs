// Prueba de punta a punta de los avisos por notificación (Web Push) contra Supabase local.
// Un servicio de entrega simulado recibe los avisos, comprueba la firma VAPID y descifra el
// contenido con las llaves del "teléfono". El navegador usa una suscripción simulada porque
// Chromium sin red no puede pedirla a Google; todo lo demás es real (página, API, base, cifrado).
//
// Requisitos: Supabase local con las migraciones, psql y la app corriendo con:
//   VAPID_PUBLICA=<pública> VAPID_PRIVADA=<privada> AVISOS_SECRETO_SERVICIO=secreto-de-avisos-e2e-0123456789abcdef
//   AVISOS_HOSTS_EXTRA=127.0.0.1:54397
// Las llaves VAPID se generan con: npx web-push generate-vapid-keys
// Uso: VAPID_PUBLICA=<la misma> node apps/web/e2e/avisos.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ece = require("http_ece");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SECRETO = "secreto-de-avisos-e2e-0123456789abcdef";
const VAPID = process.env.VAPID_PUBLICA;
if (!VAPID) throw new Error("Falta VAPID_PUBLICA (la misma con que corre la app).");

const sql = (q) => execFileSync("psql", [DB, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const afirmar = (c, d) => {
  if (!c) throw new Error(`FALLO: ${d}`);
  console.log("✓", d);
};
const esperar = async (cond, d, ms = 20000) => {
  for (const fin = Date.now() + ms; Date.now() < fin; await new Promise((r) => setTimeout(r, 300))) if (await cond()) return;
  throw new Error(`FALLO: no ocurrió: ${d}`);
};
const b64u = (b) => Buffer.from(b).toString("base64url");

// --- "Teléfono": llaves de la suscripción ---
const telefono = createECDH("prime256v1");
telefono.generateKeys();
const P256DH = b64u(telefono.getPublicKey());
const AUTH = b64u(randomBytes(16));
const ENDPOINT = `http://127.0.0.1:54397/push/${randomBytes(8).toString("hex")}`;

// --- Servicio de entrega simulado ---
const recibidos = [];
let respuesta = 201;
const llaveVapid = (() => {
  const raw = Buffer.from(VAPID, "base64url"); // 65 bytes: 0x04 | x | y
  return createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: "jwk" });
})();
const servicio = createServer((req, res) => {
  const partes = [];
  req.on("data", (c) => partes.push(c));
  req.on("end", () => {
    const cuerpo = Buffer.concat(partes);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(req.headers.authorization ?? "");
    let firma = false;
    let reclamos = null;
    if (m) {
      const [h, p, s] = m[1].split(".");
      firma = m[2] === VAPID && verify("sha256", Buffer.from(`${h}.${p}`), { key: llaveVapid, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
      reclamos = JSON.parse(Buffer.from(p, "base64url").toString());
    }
    let aviso = null;
    try {
      aviso = JSON.parse(ece.decrypt(cuerpo, { version: "aes128gcm", privateKey: telefono, authSecret: AUTH }).toString());
    } catch {}
    recibidos.push({ ruta: req.url, firma, reclamos, aviso, ttl: req.headers.ttl, tema: req.headers.topic, cifrado: req.headers["content-encoding"] });
    res.writeHead(respuesta).end();
  });
});
await new Promise((r) => servicio.listen(54397, "0.0.0.0", r));

// --- Datos: empresa en una zona donde ahora es de día y no es día de descanso ---
// (los avisos solo salen de 09:00 a 19:59 y nunca en los días de descanso).
const zonas = ["America/Mexico_City", "America/New_York", "Europe/Madrid", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland", "Pacific/Honolulu", "America/Sao_Paulo", "Europe/London", "Asia/Bangkok"];
const local = (z) => {
  const f = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "numeric", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { hora: Number(f.hour), dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(f.weekday) };
};
const ZONA = zonas.find((z) => local(z).hora >= 10 && local(z).hora <= 18);
if (!ZONA) throw new Error("No hay zona de prueba en horario diurno ahora mismo.");
const DESCANSO = (local(ZONA).dia + 3) % 7;
const s = Date.now().toString(36);
const CORREO = `avisos.${s}@ejemplo.mx`;
const dueno = sql("select gen_random_uuid()");
sql(`insert into auth.users (id, email) values ('${dueno}', 'dueno.avisos.${s}@ejemplo.mx')`);
sql(`select public.configurar_secreto_servicio('avisos', '${SECRETO}')`);
const [empresa, trabajador] = sql(`
  select set_config('request.jwt.claim.sub', '${dueno}', false);
  with e as (select public.crear_empresa('Avisos ${s}') as id),
       c as (insert into public.centros_trabajo (empresa_id, nombre, zona_horaria) select id, 'Matriz', '${ZONA}' from e returning empresa_id, id),
       t as (insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, email, fecha_ingreso, dia_descanso)
             select empresa_id, id, 'Ana Avisos', '${CORREO}', '2026-01-01', ${DESCANSO} from c returning empresa_id, id)
  select empresa_id || ' ' || id from t;`).split("\n").pop().split(" ");
const comoDueno = (q) => sql(`select set_config('request.jwt.claim.sub', '${dueno}', false); set role authenticated; ${q}`);
const enviar = (secreto = SECRETO) => fetch(`${APP}/api/avisos/enviar`, { method: "POST", headers: { "X-Checador-Secreto": secreto } });

async function codigo(desde) {
  for (let i = 0; i < 40; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CORREO}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) return /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)[1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No llegó el código");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-MX" });
await context.grantPermissions(["notifications"], { origin: APP });
// Suscripción simulada: la que el navegador obtendría del servicio de Google.
await context.addInitScript(({ endpoint, p256dh, auth }) => {
  if (!("PushManager" in self)) return;
  let activa = null;
  const crear = () => ({
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }),
    unsubscribe: async () => { activa = null; return true; },
  });
  PushManager.prototype.subscribe = async () => (activa ??= crear());
  PushManager.prototype.getSubscription = async () => activa;
  // Chromium sin pantalla reporta el permiso como negado aunque se conceda.
  if (self.Notification) {
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
  }
}, { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));

try {
  // --- La persona entra y activa los avisos ---
  await page.goto(`${APP}/avisos`);
  await page.waitForURL(/\/entrar/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(CORREO);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código").fill(await codigo(desde));
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("heading", { name: "Avisos" }).waitFor();
  await page.getByRole("link", { name: "Avisos" }).waitFor();
  afirmar(true, "la página de avisos está en el menú de la persona");
  await page.getByRole("button", { name: "Activar avisos en este teléfono" }).click();
  await page.getByText("Listo: recibirás avisos en este teléfono.").waitFor();
  afirmar(sql(`select count(*) from public.suscripciones_push where endpoint = '${ENDPOINT}'`) === "1", "el teléfono queda registrado");

  // --- Sin el secreto no se envía nada ---
  afirmar((await enviar("otro")).status === 401, "sin el secreto, el envío se rechaza");

  // --- La empresa corrige registros y hay una semana por revisar ---
  comoDueno(`
    insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
    values ('${empresa}', '${trabajador}', 'entrada', 'panel', 'Faltó la entrada', now() - interval '8 days'),
           ('${empresa}', '${trabajador}', 'salida', 'panel', 'Faltó la salida', now() - interval '8 days' + interval '8 hours');`);
  sql("select public.generar_avisos_semana()");
  let r = await (await enviar()).json();
  afirmar(r.ok && r.exitosas >= 2, `el envío entrega los avisos (${r.exitosas} entregas)`);
  await esperar(() => recibidos.length >= 2, "llegan dos notificaciones");
  const titulos = recibidos.map((x) => x.aviso?.titulo).sort();
  afirmar(titulos.join(" | ") === "Tienes una semana por revisar | Tu empresa modificó 2 de tus registros",
    "las dos correcciones llegan juntas y la semana aparte");
  afirmar(recibidos.every((x) => x.firma && x.reclamos.aud === "http://127.0.0.1:54397" && x.reclamos.exp * 1000 > Date.now()),
    "cada entrega lleva una firma VAPID válida para el servicio");
  afirmar(recibidos.every((x) => x.cifrado === "aes128gcm" && x.ttl === "86400"), "el contenido va cifrado (aes128gcm) y caduca en un día");
  afirmar(recibidos.every((x) => !/\d{1,2}:\d{2}/.test(`${x.aviso.titulo} ${x.aviso.cuerpo}`)), "ningún aviso muestra horas");
  afirmar(recibidos.every((x) => /^\/registros\?semana=\d{4}-\d{2}-\d{2}$/.test(x.aviso.url)), "cada aviso abre la semana en Mis registros");
  r = await (await enviar()).json();
  afirmar(r.grupos === 0, "lo enviado no se repite");

  // --- La notificación se muestra y abre la semana ---
  const sw = await context.waitForEvent("serviceworker", { timeout: 1000 }).catch(() => context.serviceWorkers()[0]);
  afirmar(Boolean(sw), "el service worker está activo");
  const mostradas = await sw.evaluate(async (aviso) => {
    // Chromium sin pantalla no deja mostrar notificaciones: se captura la llamada.
    const llamadas = [];
    const original = self.registration.showNotification;
    self.registration.showNotification = async (titulo, opciones) => { llamadas.push({ titulo, ...opciones }); };
    try {
      // Mismo código que el evento push real; se dispara a mano porque no hay un servicio real.
      const ev = new Event("push");
      ev.data = { json: () => aviso };
      let promesa;
      ev.waitUntil = (p) => (promesa = p);
      self.dispatchEvent(ev);
      await promesa;
    } finally {
      self.registration.showNotification = original;
    }
    return llamadas.map((n) => ({ titulo: n.titulo, cuerpo: n.body, url: n.data?.url, tag: n.tag }));
  }, recibidos[0].aviso);
  afirmar(mostradas.length === 1 && mostradas[0].titulo === recibidos[0].aviso.titulo && mostradas[0].url === recibidos[0].aviso.url,
    "el service worker muestra la notificación con su liga");

  // --- Preferencias: sin avisos de cambios en registros ---
  await page.getByRole("checkbox", { name: /Cambios en tus registros/ }).uncheck();
  await esperar(() => sql(`select correccion from public.preferencias_avisos where user_id = (select user_id from public.trabajadores where id = '${trabajador}')`) === "f",
    "se guarda la preferencia");
  const antes = recibidos.length;
  comoDueno(`insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
             values ('${empresa}', '${trabajador}', 'entrada', 'panel', 'Otra', now() - interval '9 days');`);
  r = await (await enviar()).json();
  afirmar(r.grupos === 0 && recibidos.length === antes, "con la preferencia apagada, la corrección no se avisa");

  // --- Envío disparado por la base (pg_cron → pg_net → app) ---
  const host = execFileSync("docker", ["inspect", "supabase_db_checador", "-f", "{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}"], { encoding: "utf8" }).trim();
  sql("delete from vault.secrets where name in ('checador_avisos_secreto', 'checador_avisos_url')");
  sql(`select vault.create_secret('${SECRETO}', 'checador_avisos_secreto'), vault.create_secret('http://${host}:3000/api/avisos/enviar', 'checador_avisos_url')`);
  const acuerdo = comoDueno(`insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso)
                             values ('${empresa}', '${trabajador}', 1, 'Acuerdo de prueba', ${DESCANSO}) returning id;`).split("\n").pop();
  comoDueno(`insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values ('${empresa}', '${acuerdo}', 'empleador');`);
  const solicitud = sql("select public.disparar_envio_avisos()");
  afirmar(/^\d+$/.test(solicitud), "con avisos pendientes, la base pide el envío a la app");
  await esperar(() => recibidos.some((x) => x.aviso?.titulo === "Tienes un acuerdo por firmar"), "llega el aviso del acuerdo");
  afirmar(recibidos.at(-1).aviso.url === "/acuerdo", "el aviso del acuerdo abre el acuerdo");
  afirmar(sql("select public.disparar_envio_avisos() is null") === "t", "sin pendientes, la base no llama a la app");

  // --- Teléfono que ya no existe ---
  respuesta = 410;
  comoDueno(`insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso)
             values ('${empresa}', '${trabajador}', 2, 'Acuerdo v2', ${DESCANSO}) returning id;`);
  const v2 = sql(`select id from public.acuerdos where trabajador_id = '${trabajador}' and version = 2`);
  comoDueno(`insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values ('${empresa}', '${v2}', 'empleador');`);
  r = await (await enviar()).json();
  afirmar(r.caducadas === 1 && sql(`select count(*) from public.suscripciones_push where endpoint = '${ENDPOINT}'`) === "0",
    "si el servicio dice que el teléfono ya no existe (410), se quita");
  respuesta = 201;

  // --- Desactivar desde la página ---
  await page.reload();
  await page.getByRole("button", { name: "Activar avisos en este teléfono" }).click();
  await page.getByText("Listo: recibirás avisos en este teléfono.").waitFor();
  await page.getByRole("button", { name: "Desactivar en este teléfono" }).click();
  await page.getByText("Ya no recibirás avisos en este teléfono.").waitFor();
  afirmar(sql(`select count(*) from public.suscripciones_push where endpoint = '${ENDPOINT}'`) === "0", "al desactivar, el teléfono se quita");

  console.log(`\nAvisos: todo correcto (zona de prueba ${ZONA}).`);
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  sql("delete from vault.secrets where name in ('checador_avisos_secreto', 'checador_avisos_url')");
  await browser.close();
  servicio.close();
}
