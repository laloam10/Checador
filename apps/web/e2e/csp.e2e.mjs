// Recorre las pantallas de empleador, trabajador y kiosco y falla si el navegador reporta
// cualquier violación de la Content Security Policy (una CSP mal hecha rompe la app en silencio).
// Requiere las semillas y los usuarios de las demás pruebas. Uso: node apps/web/e2e/csp.e2e.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const RUTAS = {
  "dueno.espiga@ejemplo.mx": [
    "/panel", "/panel/trabajadores", "/panel/trabajadores/aaaaaaaa-0000-0000-0000-000000000003",
    "/panel/trabajadores/aaaaaaaa-0000-0000-0000-000000000003/semana", "/panel/objeciones",
    "/panel/exportar", "/panel/centros", "/panel/accesos",
  ],
  "ana@ejemplo.mx": ["/", "/registros?semana=2026-10-26", "/pin", "/acuerdo"],
  "kiosco.centro@ejemplo.mx": ["/kiosco"],
};

const browser = await chromium.launch();
const violaciones = [];
try {
  for (const [correo, rutas] of Object.entries(RUTAS)) {
    const page = await (await browser.newContext({ locale: "es-MX" })).newPage();
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violaciones.push(`${correo} ${page.url()}: ${m.text()}`);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) =>
        console.error(`Refused to load (CSP ${e.violatedDirective}): ${e.blockedURI}`));
    });
    await page.goto(`${APP}/entrar`);
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
    await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
    for (const ruta of rutas) {
      const r = await page.goto(`${APP}${ruta}`, { waitUntil: "networkidle" });
      if (!r || r.status() >= 400) throw new Error(`${ruta} respondió ${r?.status()}`);
      // La página debe estar hidratada: un script bloqueado dejaría los botones sin funcionar.
      await page.waitForFunction(() => document.querySelectorAll("script[nonce]").length > 0);
    }
    console.log(`✓ ${correo}: ${rutas.length} pantalla(s) sin violaciones de CSP`);
    await page.context().close();
  }
  if (violaciones.length) throw new Error(`Violaciones de CSP:\n${violaciones.join("\n")}`);
  console.log("\nPrueba de CSP: OK");
} catch (e) {
  console.error("\nFALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
