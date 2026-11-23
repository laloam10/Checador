// Prueba de "Salir" con bloqueo: la persona elige volver a entrar con su PIN y, al salir, no
// se le vuelve a pedir el código del correo. Con la sesión bloqueada no se puede checar.
// Requisitos: app y Supabase local. Uso: node apps/web/e2e/acceso.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36);
const CORREO = `lucia.${sufijo}@acceso.mx`;
const PIN = "2580";
const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// CAPTURAS=<carpeta> guarda capturas de las pantallas nuevas (para revisarlas o para el manual).
const capturar = (page, nombre) => process.env.CAPTURAS && page.screenshot({ path: `${process.env.CAPTURAS}/${nombre}.png`, fullPage: true });
const correosDesde = async (desde) => {
  const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CORREO}`)}`)).json();
  return messages.filter((x) => Date.parse(x.Created) >= desde);
};

async function entrar(page) {
  await page.goto(`${APP}/`);
  await page.waitForURL(/\/entrar/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(CORREO);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  let codigo;
  for (let i = 0; i < 30 && !codigo; i++) {
    const [m] = await correosDesde(desde);
    if (m) codigo = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
    if (!codigo) await esperar(500);
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
}
async function teclear(page, texto) {
  for (const d of texto) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
}

// Empresa propia para no interferir con otras pruebas.
const [empresa, centro] = sql(`with e as (insert into empresas (razon_social) values ('Tortillería El Acceso ${sufijo}') returning id),
  c as (insert into centros_trabajo (empresa_id, nombre) select id, 'Matriz' from e returning id, empresa_id)
  select empresa_id || '|' || id from c`).split("|");
sql(`insert into trabajadores (empresa_id, centro_trabajo_id, nombre, email, numero_empleado, fecha_ingreso, dia_descanso)
     values ('${empresa}', '${centro}', 'Lucía Acceso Ramos', '${CORREO}', '051', '2026-01-05', 0)`);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-MX" })).newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));
try {
  await entrar(page);
  await page.waitForURL(`${APP}/`);
  await page.getByText("¿No quieres esperar el código del correo cada vez que sales?").waitFor();
  paso("en el inicio se sugiere volver a entrar con el PIN");

  await page.getByRole("link", { name: "Acceso" }).click();
  await page.waitForURL(`${APP}/acceso`);
  const conPin = page.getByRole("radio", { name: /Volver a entrar con mi PIN/ });
  if (await conPin.isEnabled()) throw new Error("Sin PIN no se debía poder elegir el PIN");
  await page.getByLabel("Nuevo PIN (4 a 6 dígitos)").fill(PIN);
  await page.getByLabel("Confirma el PIN").fill(PIN);
  await page.getByRole("button", { name: "Guardar PIN" }).click();
  await page.getByText("PIN guardado.").waitFor();
  await page.waitForFunction(() => !document.querySelector('input[name="al-salir"]:disabled'));
  await conPin.check();
  await page.getByText("Listo: al salir, volverás a entrar con tu PIN.").waitFor();
  await capturar(page, "acceso");
  paso("crea su PIN y elige volver a entrar con él");

  await page.getByRole("link", { name: "Checar" }).click();
  await page.waitForURL(`${APP}/`);
  if (await page.getByText("¿No quieres esperar el código").isVisible()) throw new Error("La sugerencia debía desaparecer");
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await page.getByText("Entrada registrada.").waitFor();

  const desde = Date.now() - 1000;
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(`${APP}/desbloquear`);
  await page.getByRole("heading", { name: "Hola, Lucía" }).waitFor();
  await esperar(1500);
  if ((await correosDesde(desde)).length) throw new Error("Al salir con PIN no debía enviarse un código por correo");
  paso("al salir queda bloqueado, sin enviar código por correo");

  await page.goto(`${APP}/registros`);
  await page.waitForURL(`${APP}/desbloquear?siguiente=%2Fregistros`);
  const estado = await page.evaluate(async () => (await fetch("/api/eventos", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  if (estado !== 423) throw new Error(`Con la sesión bloqueada /api/eventos debía responder 423 y respondió ${estado}`);
  paso("bloqueado no se abren pantallas ni se puede checar");

  await teclear(page, "1397");
  await page.getByText("PIN incorrecto.").waitFor();
  await capturar(page, "desbloquear");
  await teclear(page, PIN);
  await page.waitForURL(`${APP}/registros`);
  paso("con su PIN vuelve a entrar, a la pantalla que quería abrir");

  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(`${APP}/desbloquear`);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL(/\/entrar/);
  await page.goto(`${APP}/`);
  await page.waitForURL(/\/entrar/);
  paso("Cerrar sesión la termina por completo: la próxima vez se pide el código");

  console.log("\nPrueba de acceso con PIN: OK");
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png" }).catch(() => {});
  console.error("FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
