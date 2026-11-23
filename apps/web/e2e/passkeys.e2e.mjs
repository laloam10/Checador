// Prueba de volver a entrar con huella o rostro (passkeys). Chromium simula el sensor con un
// autenticador virtual (WebAuthn por CDP); todo lo demás es real: opciones, firma, verificación
// en el servidor, secreto del servicio y base.
// Requisitos: Supabase local, psql y la app corriendo con ACCESO_SECRETO_SERVICIO=<secreto>; la
// prueba guarda ese mismo secreto en la base. WebAuthn no acepta direcciones IP: usa localhost.
// Uso: ACCESO_SECRETO_SERVICIO=<el mismo> node apps/web/e2e/passkeys.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SECRETO = process.env.ACCESO_SECRETO_SERVICIO;
if (!SECRETO) throw new Error("Falta ACCESO_SECRETO_SERVICIO (el mismo con que corre la app).");
const sufijo = Date.now().toString(36);
const CORREO = `mateo.${sufijo}@huella.mx`;
const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function entrar(page) {
  await page.goto(`${APP}/`);
  await page.waitForURL(/\/entrar/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(CORREO);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  let codigo;
  for (let i = 0; i < 30 && !codigo; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CORREO}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) codigo = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
    if (!codigo) await esperar(500);
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
}

sql(`select public.configurar_secreto_servicio('acceso', '${SECRETO}')`);
const [empresa, centro] = sql(`with e as (insert into empresas (razon_social) values ('Carpintería La Huella ${sufijo}') returning id),
  c as (insert into centros_trabajo (empresa_id, nombre) select id, 'Taller' from e returning id, empresa_id)
  select empresa_id || '|' || id from c`).split("|");
sql(`insert into trabajadores (empresa_id, centro_trabajo_id, nombre, email, numero_empleado, fecha_ingreso, dia_descanso)
     values ('${empresa}', '${centro}', 'Mateo Huella Soto', '${CORREO}', '061', '2026-01-05', 0)`);

const browser = await chromium.launch();
const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-MX" });
const page = await contexto.newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));
const cdp = await contexto.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

try {
  await entrar(page);
  await page.waitForURL(`${APP}/`);
  await page.goto(`${APP}/acceso`);
  const conHuella = page.getByRole("radio", { name: /Volver a entrar con mi huella o rostro/ });
  if (await conHuella.isEnabled()) throw new Error("Sin passkey no se debía poder elegir la huella");
  await page.getByRole("button", { name: "Agregar la huella o el rostro de este teléfono" }).click();
  await page.getByText("Listo: ya puedes elegir volver a entrar con tu huella o rostro.").waitFor();
  await page.getByText("Este dispositivo").waitFor();
  const guardadas = sql(`select count(*) from passkeys p join auth.users u on u.id = p.user_id where u.email = '${CORREO}'`);
  if (guardadas !== "1") throw new Error(`Se esperaba 1 passkey guardada y hay ${guardadas}`);
  paso("registra la huella o el rostro del teléfono (en la base queda solo la llave pública)");

  await page.waitForFunction(() => !document.querySelectorAll('input[name="al-salir"]')[0]?.disabled);
  await conHuella.check();
  await page.getByText("Listo: al salir, volverás a entrar con tu huella o rostro.").waitFor();
  if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/acceso-huella.png`, fullPage: true });
  paso("elige volver a entrar con huella o rostro");

  await page.getByRole("link", { name: "Checar" }).click();
  await page.waitForURL(`${APP}/`);
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(`${APP}/desbloquear`);
  if (await page.getByRole("group", { name: "Teclado numérico" }).isVisible()) throw new Error("Sin PIN no debía mostrarse el teclado");
  if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/desbloquear-huella.png`, fullPage: true });
  await page.getByRole("button", { name: "Entrar con huella o rostro" }).click();
  await page.waitForURL(`${APP}/`);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await page.getByText("Entrada registrada.").waitFor();
  const usada = sql(`select p.usada_en is not null from passkeys p join auth.users u on u.id = p.user_id where u.email = '${CORREO}'`);
  if (usada !== "t") throw new Error("La passkey debía quedar marcada como usada");
  paso("al salir queda bloqueado y entra con la huella, sin código por correo; ya puede checar");

  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(`${APP}/desbloquear`);
  await cdp.send("WebAuthn.clearCredentials", { authenticatorId });
  await page.getByRole("button", { name: "Entrar con huella o rostro" }).click();
  await page.getByRole("alert").waitFor();
  if (!page.url().endsWith("/desbloquear")) throw new Error("Sin la passkey no debía desbloquear");
  paso("otro teléfono (sin esa passkey) no desbloquea");

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL(/\/entrar/);
  paso("Cerrar sesión la termina por completo");

  console.log("\nPrueba de huella o rostro: OK");
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png" }).catch(() => {});
  console.error("FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
