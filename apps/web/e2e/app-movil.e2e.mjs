// Prueba de punta a punta de la preparación para la app instalada desde las tiendas (fase 2).
// Simula lo que hará la app con Capacitor: entra con el código por correo usando supabase-js,
// y llama a la API con el token en Authorization y el origen de Capacitor.
//
// Requisitos: Supabase local (con Mailpit), psql, semilla.sql (Ana Pérez) y la app corriendo
// con APP_VERSION_MINIMA=1.2.0.
// Uso: node apps/web/e2e/app-movil.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO = process.env.CORREO ?? "ana@ejemplo.mx";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sql = (q) => execFileSync("psql", [DB, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const afirmar = (c, d) => {
  if (!c) throw new Error(`FALLO: ${d}`);
  console.log("✓", d);
};

// --- Sesión como la tendría la app (supabase-js con código por correo) ---
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const desde = Date.now() - 1000;
const { error: e1 } = await supabase.auth.signInWithOtp({ email: CORREO, options: { shouldCreateUser: false } });
if (e1) throw e1;
let codigo;
for (let i = 0; i < 40 && !codigo; i++) {
  const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CORREO}`)}`)).json();
  const m = messages.find((x) => Date.parse(x.Created) >= desde);
  if (m) codigo = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
  if (!codigo) await new Promise((r) => setTimeout(r, 500));
}
const { data: sesion, error: e2 } = await supabase.auth.verifyOtp({ email: CORREO, token: codigo, type: "email" });
if (e2) throw e2;
const TOKEN = sesion.session.access_token;
const trabajador = sql(`select id from public.trabajadores where email = '${CORREO}' and fecha_baja is null limit 1`);
afirmar(Boolean(TOKEN && trabajador), "la app obtiene una sesión con el código por correo, sin cookies");

const app = (ruta, { metodo = "GET", origen = "capacitor://localhost", token = TOKEN, cuerpo, extra = {} } = {}) =>
  fetch(`${APP}${ruta}`, {
    method: metodo,
    headers: {
      ...(origen ? { Origin: origen } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      "X-Checador-Plataforma": "ios",
      "X-Checador-Version": "1.2.0",
      ...extra,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

// --- CORS ---
let r = await app("/api/eventos", { metodo: "OPTIONS", token: null, extra: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
afirmar(r.status === 204 && r.headers.get("access-control-allow-origin") === "capacitor://localhost"
  && /Authorization/.test(r.headers.get("access-control-allow-headers")), "la app de iOS pasa la verificación previa (CORS)");
r = await app("/api/eventos", { metodo: "OPTIONS", origen: "https://localhost", token: null });
afirmar(r.headers.get("access-control-allow-origin") === "https://localhost", "también la de Android");
r = await app("/api/eventos", { metodo: "OPTIONS", origen: "https://evil.mx", token: null });
afirmar(!r.headers.get("access-control-allow-origin"), "otro sitio no recibe permiso de CORS");
r = await app("/api/exportar", { origen: "capacitor://localhost" });
afirmar(!r.headers.get("access-control-allow-origin"), "las rutas del panel no se abren a la app");
afirmar(!r.headers.get("access-control-allow-credentials"), "nunca se permiten cookies entre orígenes");

// --- Versión mínima ---
r = await app("/api/app/version");
const v = await r.json();
afirmar(r.status === 200 && v.minima === "1.2.0" && r.headers.get("access-control-allow-origin") === "capacitor://localhost",
  "la app consulta la versión mínima que acepta el servidor");

// --- Checada con token ---
r = await app("/api/eventos", { metodo: "POST", token: null, cuerpo: { trabajadorId: trabajador, tipo: "entrada", idCliente: randomUUID() } });
afirmar(r.status === 401, "sin token no se registra nada");
r = await app("/api/eventos", { metodo: "POST", token: "aaa.bbb.ccc", cuerpo: { trabajadorId: trabajador, tipo: "entrada", idCliente: randomUUID() } });
afirmar(r.status === 401, "un token inválido no se acepta");
const estado = sql(`select tipo from public.eventos where trabajador_id = '${trabajador}' and tipo in ('entrada','salida') order by id desc limit 1`);
const tipo = estado === "entrada" ? "salida" : "entrada";
const idCliente = randomUUID();
r = await app("/api/eventos", { metodo: "POST", cuerpo: { trabajadorId: trabajador, tipo, idCliente } });
const j = await r.json();
afirmar(r.status === 200 && j.ok && r.headers.get("access-control-allow-origin") === "capacitor://localhost", `la app registra la ${tipo} con su token`);
const fila = sql(`select origen || '|' || (evidencia ->> 'plataforma') || '|' || (evidencia ->> 'version') || '|' || (evidencia ->> 'ip' is not null) from public.eventos where id_cliente = '${idCliente}'`);
afirmar(fila === "app|ios|1.2.0|true", "queda con origen app, plataforma, versión e IP en la evidencia");
r = await app("/api/eventos", { metodo: "POST", cuerpo: { trabajadorId: trabajador, tipo, idCliente } });
afirmar((await r.json()).duplicado === true, "el reintento del mismo registro no duplica");
const otro = sql(`select id from public.trabajadores where id <> '${trabajador}' and fecha_baja is null limit 1`);
r = await app("/api/eventos", { metodo: "POST", cuerpo: { trabajadorId: otro, tipo: "entrada", idCliente: randomUUID() } });
afirmar(r.status === 403, "con su token no puede checar por otra persona");

// --- Conformidad y firma del acuerdo también aceptan el token ---
for (const [ruta, esperado] of [["/api/conformidades", "Respuesta inválida."], ["/api/acuerdos/firmar", "Debes confirmar que leíste y aceptas el acuerdo."]]) {
  const sinToken = await app(ruta, { metodo: "POST", token: null, cuerpo: {} });
  const conToken = await app(ruta, { metodo: "POST", cuerpo: {} });
  const texto = (await conToken.json()).error;
  afirmar(sinToken.status === 401 && conToken.status === 400 && texto === esperado, `${ruta}: el token se acepta (sin token, 401)`);
}

// --- La PWA sigue igual ---
r = await fetch(`${APP}/api/eventos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
afirmar(r.status === 401 && !r.headers.get("access-control-allow-origin"), "sin token ni cookie, la PWA recibe 401 como antes");

console.log("\nApp instalada (fase 2): todo correcto.");
