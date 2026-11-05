// Prueba de punta a punta del kiosco con PIN contra Supabase local.
// Requisitos: los de pwa.e2e.mjs, más `psql` y semilla-kiosco.sql cargada.
// Uso: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node apps/web/e2e/kiosco.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO = "kiosco.centro@ejemplo.mx";
const EMPRESA = "aaaaaaaa-0000-0000-0000-000000000001";
const CENTRO = "aaaaaaaa-0000-0000-0000-000000000002";
const BETO = "aaaaaaaa-0000-0000-0000-000000000004";

const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();

async function codigo(desde) {
  for (let i = 0; i < 30; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CORREO}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) {
      const d = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const c = /\b(\d{6})\b/.exec(d.Text || d.HTML);
      if (c) return c[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No llegó el código");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 800, height: 1280 }, locale: "es-MX" });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));

async function teclear(texto) {
  for (const d of texto) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
}
async function identificarse(numero, pin) {
  await page.getByRole("heading", { name: "Número de empleado" }).waitFor();
  await teclear(numero);
  await page.getByRole("heading", { name: "PIN" }).waitFor();
  await teclear(pin);
}
const eventosBeto = () => Number(sql(`select count(*) from eventos where trabajador_id = '${BETO}' and origen = 'kiosco'`));

try {
  // 1. Configurar el dispositivo como kiosco (se parte de una cuenta sin rol, para poder repetir la prueba)
  sql(`delete from miembros where user_id in (select id from auth.users where email = '${CORREO}')`);
  await page.goto(`${APP}/kiosco`);
  await page.waitForURL(/\/entrar\?siguiente=%2Fkiosco/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(CORREO);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código").fill(await codigo(desde));
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${APP}/kiosco`);
  await page.getByText("no está configurado como kiosco").waitFor();
  paso("una cuenta sin rol de kiosco no puede usar el kiosco");

  sql(`insert into miembros (empresa_id, user_id, rol, centro_trabajo_id)
       select '${EMPRESA}', id, 'kiosco', '${CENTRO}' from auth.users where email = '${CORREO}' on conflict do nothing`);
  await page.reload();
  await page.getByText("Panadería La Espiga SA de CV · Sucursal Centro").waitFor();
  paso("el administrador asigna el rol de kiosco y el dispositivo queda listo");

  const antes = eventosBeto();

  // 2. PIN incorrecto
  await identificarse("002", "1111");
  await page.getByText("Número de empleado o PIN incorrecto.").waitFor();
  paso("PIN incorrecto se rechaza con mensaje genérico");

  // 3. Entrada con PIN correcto
  await identificarse("002", "2580");
  await page.getByRole("heading", { name: "Hola, Beto" }).waitFor();
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await page.getByText("Entrada registrada").waitFor();
  await page.getByText(/Beto López · \d{2}:\d{2}/).waitFor();
  paso("entrada registrada con número de empleado y PIN");
  await page.getByRole("heading", { name: "Número de empleado" }).waitFor({ timeout: 8000 });
  paso("la pantalla vuelve sola al inicio");

  // 4. Identificado en línea, salida sin conexión
  await identificarse("002", "2580");
  await page.getByText(/Trabajando desde las \d{2}:\d{2}/).waitFor();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Registrar salida" }).click();
  await page.getByText("Salida guardada sin conexión").waitFor();
  await page.getByText("1 checada(s) pendientes de enviar").waitFor();
  paso("salida sin conexión guardada en el kiosco");

  // 5. Totalmente sin conexión, con PIN incorrecto: debe rechazarse al sincronizar
  await page.getByRole("heading", { name: "Número de empleado" }).waitFor({ timeout: 8000 });
  await identificarse("002", "9999");
  await page.getByRole("heading", { name: "Sin conexión" }).waitFor();
  await page.getByRole("button", { name: "Entrada", exact: true }).click();
  await page.getByText("2 checada(s) pendientes de enviar").waitFor();
  paso("sin conexión no se puede verificar el PIN: la checada queda pendiente");

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText("1 checada(s) sin conexión rechazadas").waitFor({ timeout: 15000 });
  await page.getByText(/pendientes de enviar/).waitFor({ state: "detached" });
  paso("al reconectar: la salida se envió y la de PIN incorrecto quedó rechazada para el supervisor");

  const despues = eventosBeto();
  if (despues - antes !== 2) throw new Error(`Se esperaban 2 eventos nuevos de Beto, hay ${despues - antes}`);
  const ultimo = sql(`select tipo || ',' || diferido || ',' || (registrado_por is not null) || ',' || (evidencia ? 'agente')
                      from eventos where trabajador_id = '${BETO}' order by id desc limit 1`);
  if (ultimo !== "salida,true,true,true") throw new Error(`Último evento inesperado: ${ultimo}`);
  const pinGuardado = await page.evaluate(async () => {
    const req = indexedDB.open("keyval-store");
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = db.transaction("keyval", "readonly").objectStore("keyval").get("checador:kiosco:pendientes");
    const lista = await new Promise((r) => (tx.onsuccess = () => r(tx.result)));
    return lista?.map((p) => p.pin);
  });
  if (pinGuardado?.some((p) => p)) throw new Error("El PIN de una checada rechazada sigue guardado en el dispositivo");
  paso("en la base: 2 eventos de kiosco, la salida diferida con evidencia; ningún PIN queda en el dispositivo");

  console.log("\nPrueba del kiosco: OK");
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
