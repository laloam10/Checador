// Capturas de la empresa de ejemplo (Cafetería Los Arcos) que crea generar.cjs.
// Solo contra la app local conectada al Supabase local (ver README.md de esta carpeta).
// Uso: CHECADOR_EJEMPLO=local node scripts/ejemplo/capturar.cjs [carpeta]   (por omisión, salida/capturas)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP = "http://127.0.0.1:3000";
const MAILPIT = "http://127.0.0.1:54324";
const SALIDA = path.join(__dirname, "salida");
const OUT = path.resolve(process.argv[2] ?? path.join(SALIDA, "capturas"));
const IDS = path.join(SALIDA, "ids.json");
if (!fs.existsSync(IDS)) { console.error("FALLÓ: no hay salida/ids.json; corre antes generar.cjs."); process.exit(1); }
const ids = JSON.parse(fs.readFileSync(IDS, "utf8"));
const T = ids.trabajadores;
const C = ids.correos;
const { L3, L2, L1 } = ids.semanas;
const log = (t) => console.log("✓", t);
const esLocal = (url) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);

async function verificarLocal() {
  if (process.env.CHECADOR_EJEMPLO !== "local") throw new Error("Confírmalo con CHECADOR_EJEMPLO=local (solo la app y el Supabase local).");
  const r = await fetch(`${APP}/entrar`, { redirect: "manual" }).catch(() => null);
  if (!r) throw new Error(`La app no responde en ${APP}.`);
  const fuentes = (/connect-src([^;]*)/.exec(r.headers.get("content-security-policy") ?? "")?.[1] ?? "").trim().split(/\s+/).filter((f) => /^(https?|wss?):\/\//.test(f));
  if (!fuentes.length || fuentes.some((f) => !esLocal(f))) throw new Error(`La app está conectada a ${fuentes.join(", ")}: debe usar el Supabase local.`);
}

async function codigo(correo, desde) {
  for (let i = 0; i < 60; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) { const c = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1]; if (c) return c; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el código a ${correo}`);
}
async function entrar(page, correo, destino = "/") {
  await page.goto(`${APP}/entrar?siguiente=${encodeURIComponent(destino)}`);
  await page.getByLabel("Tu correo").fill(correo);
  const desde = Date.now() - 1000;
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código").waitFor();
  await page.getByLabel("Código").fill(await codigo(correo, desde));
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
}
let n = 0;
async function shot(page, nombre, url, { completa = true, antes } = {}) {
  if (url) await page.goto(APP + url);
  await page.waitForLoadState("networkidle");
  if (antes) await antes(page);
  // En capturas de página completa, la barra inferior fija iría a media imagen: va al final.
  if (completa) await page.addStyleTag({ content: "html { position: relative; } .barra-inferior { position: absolute !important; bottom: 0 !important; }" });
  await page.waitForTimeout(400);
  n++;
  const archivo = `${String(n).padStart(2, "0")}-${nombre}.png`;
  await page.screenshot({ path: path.join(OUT, archivo), fullPage: completa });
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  const vista = page.viewportSize().width;
  console.log(`  ${archivo}${ancho > vista ? `  ⚠ desborda (${ancho}px)` : ""}`);
}

(async () => {
  await verificarLocal();
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = (vp, extra = {}) => b.newContext({ viewport: vp, deviceScaleFactor: 2, locale: "es-MX", ...extra });
  const ESC = { width: 1280, height: 860 };
  const CEL = { width: 390, height: 844 };

  // ---------- Panel del empleador (escritorio) ----------
  const d = await (await ctx(ESC)).newPage();
  await entrar(d, C.dueno, "/panel");
  await shot(d, "panel-tablero", "/panel");
  await shot(d, "panel-tablero-semana-pasada", "/panel?horas=pasada", {
    completa: false, antes: async (p) => { await p.locator(".tarjeta-grafica").scrollIntoViewIfNeeded(); await p.locator(".grafica-pista").first().hover(); },
  });
  await shot(d, "panel-trabajadores", "/panel/trabajadores");
  await shot(d, "panel-ficha-jorge", `/panel/trabajadores/${T.jorge.id}`);
  await shot(d, "panel-semana-jorge-objecion-corregida", `/panel/trabajadores/${T.jorge.id}/semana?semana=${L2}`);
  await shot(d, "panel-semana-luis-objecion-pendiente", `/panel/trabajadores/${T.luis.id}/semana?semana=${L1}`);
  await shot(d, "panel-semana-luis-checada-anulada", `/panel/trabajadores/${T.luis.id}/semana?semana=${L3}`);
  await shot(d, "panel-semana-mariana-ubicacion", `/panel/trabajadores/${T.mariana.id}/semana?semana=${L2}`);
  await shot(d, "panel-semana-daniela-whatsapp", `/panel/trabajadores/${T.daniela.id}/semana?semana=${L1}`);
  await shot(d, "panel-objeciones", "/panel/objeciones");
  // Exportar la semana pasada de Jorge (PDF) y guardar la constancia
  await d.goto(`${APP}/panel/exportar`);
  await d.locator("select[name=trabajador]").selectOption({ label: "Jorge Castillo Vega" });
  await d.locator("input[name=desde]").fill(L2);
  await d.locator("input[name=hasta]").fill(new Date(Date.parse(`${L1}T12:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10));
  const [desc] = await Promise.all([d.waitForEvent("download"), d.getByRole("button", { name: "Exportar" }).click()]);
  const pdf = path.join(OUT, "constancia-jorge.pdf");
  await desc.saveAs(pdf);
  await d.getByRole("status").filter({ hasText: "Huella SHA-256" }).waitFor();
  await shot(d, "panel-exportar", null);
  execFileSync("pdftoppm", ["-png", "-r", "110", pdf, path.join(OUT, `${String(++n).padStart(2, "0")}-constancia-pdf`)]);
  console.log(`  ${String(n).padStart(2, "0")}-constancia-pdf-*.png`);
  await shot(d, "panel-centros", "/panel/centros");
  await shot(d, "panel-accesos", "/panel/accesos");
  await shot(d, "panel-configuracion", "/panel/configuracion");
  log("panel del empleador");

  // Panel en el celular
  const dc = await (await ctx(CEL, { isMobile: true, hasTouch: true, storageState: await d.context().storageState() })).newPage();
  await shot(dc, "panel-celular-tablero", "/panel");
  await shot(dc, "panel-celular-trabajadores", "/panel/trabajadores");
  log("panel en el celular");

  // ---------- App de la persona trabajadora (celular) ----------
  const geo = (c) => ({ geolocation: { latitude: c[0], longitude: c[1], accuracy: 15 }, permissions: ["geolocation"] });
  const rosa = await (await ctx(CEL, { isMobile: true, hasTouch: true, ...geo([20.67478, -103.34771]) })).newPage();
  await entrar(rosa, C.rosa);
  await shot(rosa, "app-rosa-checar", "/");
  await shot(rosa, "app-rosa-mis-registros", "/registros");
  await shot(rosa, "app-rosa-semana-con-ubicacion", `/registros?semana=${L2}`);
  await shot(rosa, "app-rosa-acuerdo", "/acuerdo");
  await shot(rosa, "app-rosa-acceso", "/acceso");
  const daniela = await (await ctx(CEL, { isMobile: true, hasTouch: true })).newPage();
  await entrar(daniela, C.daniela);
  await shot(daniela, "app-daniela-checar-pendiente", "/");
  await shot(daniela, "app-daniela-semana-por-revisar", `/registros?semana=${L1}`);
  const mariana = await (await ctx(CEL, { isMobile: true, hasTouch: true })).newPage();
  await entrar(mariana, C.mariana);
  await shot(mariana, "app-mariana-checar", "/");
  await shot(mariana, "app-mariana-semana-fuera-de-radio", `/registros?semana=${L2}`);
  log("app de la persona trabajadora");

  // ---------- Kiosco (tableta) ----------
  const k = await (await ctx({ width: 800, height: 1280 }, { hasTouch: true })).newPage();
  await entrar(k, C.kiosco, "/kiosco");
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor();
  await shot(k, "kiosco-inicio", null, { completa: false });
  const teclear = async (t) => { for (const c of t) await k.getByRole("button", { name: c, exact: true }).click(); await k.getByRole("button", { name: "Continuar" }).click(); };
  await teclear(T.luis.numero);
  await k.getByRole("heading", { name: "PIN" }).waitFor();
  await teclear(T.luis.pin);
  await k.getByRole("heading", { name: /Hola, Luis/ }).waitFor();
  await shot(k, "kiosco-acciones-luis", null, { completa: false });
  const terminar = k.getByRole("button", { name: "Terminar pausa" });
  await (await terminar.count() ? terminar : k.getByRole("button", { name: "Iniciar pausa" })).click();
  await k.locator(".listo-hora").waitFor();
  await k.waitForTimeout(1100);
  await shot(k, "kiosco-confirmacion", null, { completa: false });
  await k.getByRole("button", { name: "Siguiente persona" }).click();
  await k.getByRole("button", { name: "Toca la pantalla para checar" }).waitFor({ timeout: 70000 });
  await k.waitForTimeout(900);
  await shot(k, "kiosco-reposo", null, { completa: false });
  log("kiosco");

  await b.close();
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
