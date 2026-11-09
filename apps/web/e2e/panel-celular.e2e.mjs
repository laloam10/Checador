// Prueba del panel en un celular: barra inferior, menú "Más", tablas como tarjetas y sin
// desbordes horizontales. Uso: node apps/web/e2e/panel-celular.e2e.mjs (app y Supabase local)
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const sufijo = Date.now().toString(36);
const DUENO = `dueno.${sufijo}@celular.mx`;
const paso = (t) => console.log(`✓ ${t}`);

async function entrar(page, correo, destino) {
  await page.goto(`${APP}${destino}`);
  await page.waitForURL(/\/entrar/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(correo);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  let codigo;
  for (let i = 0; i < 30 && !codigo; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) codigo = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
    if (!codigo) await new Promise((r) => setTimeout(r, 500));
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
}

const browser = await chromium.launch();
const p = await (await browser.newContext({ ...devices["iPhone 13"], locale: "es-MX" })).newPage();
p.on("pageerror", (e) => console.error("Error en la página:", e.message));
const sinDesborde = async (donde) => {
  const [ancho, vista] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (ancho > vista) throw new Error(`${donde}: la página se desborda (${ancho}px > ${vista}px)`);
};

try {
  await entrar(p, DUENO, "/panel");
  await p.waitForURL(`${APP}/alta-empresa`);
  await p.getByLabel("Razón social o nombre del negocio").fill(`Fonda El Celular ${sufijo}`);
  await p.getByLabel("Sí, puede salir").check();
  await p.getByRole("button", { name: "Crear empresa" }).click();
  await p.waitForURL(`${APP}/panel`);

  const barra = p.getByRole("navigation", { name: "Secciones del panel" });
  await barra.waitFor();
  if (await p.locator(".nav-panel").isVisible()) throw new Error("Las pestañas de escritorio no debían verse en el celular");
  await sinDesborde("Tablero");
  paso("en el celular la navegación es una barra inferior");

  await barra.getByRole("link", { name: "Trabajadores" }).click();
  await p.waitForURL(`${APP}/panel/trabajadores`);
  await p.getByLabel("Nombre completo").fill("Teodora Celular Larguísimo de Apellidos");
  await p.getByLabel("Número de empleado").fill("777");
  await p.getByLabel("Fecha de ingreso").fill("2026-01-05");
  await p.getByRole("button", { name: "Dar de alta" }).click();
  await p.getByRole("heading", { name: /Teodora/ }).waitFor();
  await barra.getByRole("link", { name: "Trabajadores" }).click();
  const tarjeta = p.locator("table.tabla-tarjetas tbody tr", { hasText: "Teodora" });
  await tarjeta.getByText("Acuerdo").waitFor();
  if (!(await tarjeta.getByText("Sin acuerdo", { exact: true }).isVisible())) throw new Error("La columna Acuerdo no se ve en la tarjeta");
  await sinDesborde("Trabajadores");
  paso("la lista de trabajadores se ve como tarjetas, con todas sus columnas visibles");

  await barra.getByText("Más").click();
  await p.locator(".barra-menu").getByRole("link", { name: "Centros" }).waitFor();
  await p.getByRole("heading", { name: "Trabajadores" }).click();
  if (await p.locator(".barra-menu").isVisible()) throw new Error("El menú Más debía cerrarse al tocar fuera");
  await barra.getByText("Más").click();
  await p.locator(".barra-menu").getByRole("link", { name: "Exportar" }).click();
  await p.waitForURL(`${APP}/panel/exportar`);
  if (await p.locator(".barra-menu").isVisible()) throw new Error("El menú Más debía cerrarse al navegar");
  await sinDesborde("Exportar");
  paso("el menú Más lleva a Exportar, Centros y Accesos y se cierra al tocar fuera o al navegar");

  console.log("\nPrueba del panel en el celular: OK");
} catch (e) {
  await p.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
