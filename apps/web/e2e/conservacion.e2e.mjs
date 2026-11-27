// Prueba de punta a punta de la conservación después de terminar (términos 9.3) y de los
// avisos de cambios en el panel (términos 6.6 y 15). Ver docs/cobro.md.
// Requisitos: Supabase local con la migración 20261208000001 y la app corriendo.
// Uso: node apps/web/e2e/conservacion.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36);
const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (f) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;

async function entrar(page, correo, destino) {
  await page.goto(`${APP}/entrar?siguiente=${encodeURIComponent(destino)}`);
  await page.getByLabel("Tu correo").fill(correo);
  const desde = Date.now() - 1000;
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código").waitFor();
  for (let i = 0; i < 40; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    const cod = m && /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
    if (cod) { await page.getByLabel("Código").fill(cod); break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
}

const RESUMEN = `Prueba ${sufijo}: la persona adicional del tramo 3 a 10 pasa de $50 a $55 al mes, más IVA.`;
const browser = await chromium.launch();
let aviso;
let cobroApagado = false;
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-MX" })).newPage();
  const DUENO = `dueno.conservacion.${sufijo}@ejemplo.mx`;
  const EMPRESA = `Ferretería Conserva ${sufijo}`;
  await entrar(page, DUENO, "/alta-empresa");
  const uid = sql(`select id from auth.users where email = '${DUENO}'`);
  const empresa = sql(`begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); select public.crear_empresa('${EMPRESA}'); commit;`)
    .split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));

  // 1. Aviso de cambio próximo (lo publicaría avisar_cambio_a_clientes; aquí, directo en la tabla).
  aviso = sql(`insert into avisos_cambios (tipo, vigente_desde, resumen, enlace)
               values ('precio', current_date + 40, '${RESUMEN}', 'https://jemba.mx/checador') returning id`).split("\n")[0];
  const vigente = sql(`select current_date + 40`);
  await page.goto(`${APP}/panel`);
  const cambios = page.locator(".aviso-cambios");
  await cambios.getByText(`A partir del ${fecha(vigente)} cambia el precio de Checador`).waitFor();
  await cambios.getByText(RESUMEN).waitFor();
  if ((await cambios.getByRole("link", { name: "Ver el detalle" }).getAttribute("href")) !== "https://jemba.mx/checador") throw new Error("Enlace del aviso incorrecto");
  await cambios.getByText(/puedes cancelar antes de esa fecha/).waitFor();
  paso("el panel muestra el cambio de precio próximo con su fecha, resumen y enlace");

  // Un aviso que ya entró en vigor no se muestra.
  sql(`set session_replication_role = replica; update avisos_cambios set vigente_desde = current_date - 1 where id = ${aviso}`);
  await page.reload();
  await page.locator(".panel-contenido").waitFor();
  if (await page.locator(".aviso-cambios").getByText(RESUMEN).count()) throw new Error("Un aviso vigente ya no debía mostrarse");
  paso("al entrar en vigor, el aviso deja de mostrarse");

  // 2. Cancelada: se conserva en solo lectura 12 meses, con la fecha en el panel.
  sql(`update suscripciones set estado = 'cancelada', periodo_fin = now() - interval '1 month' where empresa_id = '${empresa}'`);
  const hasta = sql(`select ((public._cobro_situacion('${empresa}') ->> 'conservar_hasta')::timestamptz at time zone 'America/Mexico_City')::date`);
  await page.reload();
  await page.locator(".aviso-cobro-suspendida").getByText(`exportar todos tus registros hasta el ${fecha(hasta)}`).waitFor();
  paso(`cancelada: el panel dice hasta cuándo se conservan los registros (${fecha(hasta)})`);

  // La exportación sigue disponible.
  await page.goto(`${APP}/panel/exportar`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  paso("cancelada: la página de exportación sigue disponible");

  // 3. Cobro apagado (interruptor, migración 20261209000001): sin restricciones ni días de prueba.
  sql(`update ajustes_cobro set activo = false`);
  cobroApagado = true;
  await page.goto(`${APP}/panel`);
  await page.locator(".panel-contenido").waitFor();
  if (await page.locator(".aviso-cobro-suspendida").count()) throw new Error("Con el cobro apagado no debía haber aviso de cobro");
  sql(`update suscripciones set estado = 'prueba', periodo_fin = null, prueba_hasta = now() - interval '10 days' where empresa_id = '${empresa}'`);
  await page.goto(`${APP}/panel/configuracion#suscripcion`);
  await page.getByText("Sin costo por ahora").waitFor();
  if (await page.getByText(/días de prueba|Prueba terminada/).count()) throw new Error("Con el cobro apagado no debían mostrarse días de prueba");
  await page.getByText("Con tu personal de hoy pagarías").waitFor();
  paso("cobro apagado: sin aviso de cobro, «Sin costo por ahora» y el precio de referencia");

  console.log("\nPrueba de conservación y avisos: OK");
} catch (e) {
  console.error("\nFALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (cobroApagado) sql(`update ajustes_cobro set activo = true`);
  if (aviso) sql(`set session_replication_role = replica; delete from avisos_cambios where id = ${aviso}`);
  await browser.close();
}
