// Prueba de punta a punta de la PWA del trabajador contra Supabase local.
//
// Requisitos:
//   1. `npx supabase start` (desde la raíz del repo; usa Mailpit para los correos).
//   2. La app corriendo en APP_URL con las variables de Supabase local.
//   3. Datos de prueba: `psql "$DB_URL" -f apps/web/e2e/semilla.sql`.
//
// Uso: APP_URL=http://127.0.0.1:3000 MAILPIT_URL=http://127.0.0.1:54324 node apps/web/e2e/pwa.e2e.mjs
import { createRequire } from "node:module";
// require() también encuentra una instalación global de Playwright (npm i -g playwright).
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const CORREO = process.env.CORREO ?? "ana@ejemplo.mx";
const LUNES_PASADO = process.env.LUNES_PASADO; // semana sembrada en semilla.sql

const paso = (t) => console.log(`✓ ${t}`);

async function codigoDeMailpit(desde) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CORREO}`)}`);
    const { messages = [] } = await r.json();
    const msg = messages.find((m) => Date.parse(m.Created) >= desde);
    if (msg) {
      const det = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const m = /\b(\d{6})\b/.exec(det.Text || det.HTML);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No llegó el correo con el código");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-MX" });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));

try {
  // 1. Sin sesión → /entrar
  await page.goto(APP);
  await page.waitForURL("**/entrar");
  paso("sin sesión redirige a /entrar");

  // 2. Código por correo
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(CORREO);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código").waitFor();
  const codigo = await codigoDeMailpit(desde);
  paso(`llegó el código por correo (${codigo})`);
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(APP + "/");
  await page.getByText("Ana Pérez").waitFor();
  paso("entró y su cuenta quedó vinculada al trabajador");

  // 3. Entrada, pausa, fin de pausa
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await page.getByText(/Trabajando desde las/).waitFor();
  paso("entrada registrada");
  await page.getByRole("button", { name: "Iniciar pausa" }).click();
  await page.getByText("En pausa", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Terminar pausa" }).click();
  await page.getByText(/Trabajando desde las/).waitFor();
  paso("pausa registrada");

  // 4. Salida sin conexión → cola → sincronización
  // (la bitácora no se borra: corridas anteriores pueden haber dejado checadas de hoy)
  const marcasDiferidas = page.getByText("sin conexión", { exact: true });
  const diferidasAntes = await marcasDiferidas.count();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Registrar salida" }).click();
  await page.getByText(/guardada sin conexión/).waitFor();
  await page.getByText("pendiente de enviar").waitFor();
  await page.getByText("Fuera de turno").waitFor();
  paso("salida sin conexión guardada en el teléfono");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText(/Se enviaron 1 checada/).waitFor({ timeout: 15000 });
  await page.getByText("pendiente de enviar").waitFor({ state: "detached" });
  await page.waitForFunction(
    (n) => [...document.querySelectorAll(".etiqueta")].filter((e) => e.textContent === "sin conexión").length === n,
    diferidasAntes + 1,
  );
  paso("al volver la red se envió y quedó marcada como diferida");

  // 5. Mis registros: semana pasada sembrada y conformidad
  if (LUNES_PASADO) {
    await page.goto(`${APP}/registros?semana=${LUNES_PASADO}`);
    await page.getByText("Total").waitFor();
    const total = await page.locator("tfoot td").nth(1).innerText();
    const extra = await page.locator("tfoot td").nth(2).innerText();
    assert.equal(total, "50:00", "total trabajado de la semana sembrada");
    assert.equal(extra, "2:00", "tiempo extra de la semana sembrada");
    paso(`registros de la semana: ${total} trabajadas, ${extra} extra`);

    await page.getByRole("button", { name: "Algo no es correcto" }).click();
    await page.getByLabel("¿Qué no es correcto?").fill("El lunes salí a las 19:30");
    await page.getByRole("button", { name: "Enviar objeción" }).click();
    await page.getByText("Objetaste esta semana").waitFor();
    paso("objeción registrada");

    await page.getByRole("button", { name: "Estoy de acuerdo con mis registros" }).click();
    await page.getByText("Diste tu conformidad").waitFor();
    const comprobante = await page.locator(".comprobante").innerText();
    assert.match(comprobante, /Comprobante: registro n\.º \d+ · [0-9a-f]{16}/);
    paso(`conformidad registrada con ${comprobante}`);
  }

  // 6. Salir
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL("**/entrar");
  paso("salió y se borró la caché local");

  console.log("\nPrueba de punta a punta: OK");
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
