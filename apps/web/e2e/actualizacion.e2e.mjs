// Prueba del aviso de versión nueva: en el panel aparece "Actualizar" (sin recargar sola) y el
// kiosco se recarga solo cuando nadie lo está usando. Se simula un despliegue nuevo cambiando
// la respuesta de /api/despliegue.
// Requisitos: app y Supabase local, semilla-kiosco.sql cargada.
// Uso: node apps/web/e2e/actualizacion.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const KIOSCO = "kiosco.centro@ejemplo.mx";
const EMPRESA = "aaaaaaaa-0000-0000-0000-000000000001";
const CENTRO = "aaaaaaaa-0000-0000-0000-000000000002";
const sufijo = Date.now().toString(36);
const DUENO = `dueno.${sufijo}@version.mx`;
const AVISO = "Hay una versión nueva de Checador.";
const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (!codigo) await esperar(500);
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
}

// Simula (o deja de simular) un despliegue nuevo en el servidor.
async function despliegueNuevo(page, activo) {
  await page.unroute("**/api/despliegue");
  if (activo) await page.route("**/api/despliegue", (r) => r.fulfill({ json: { despliegue: "version-nueva-e2e" } }));
}
// Marca la página: si se recarga, la marca desaparece.
const marcar = (page) => page.evaluate(() => (window.__sinRecargar = true));
const recargada = (page) => page.evaluate(() => !window.__sinRecargar);
// Al volver a la pestaña se revisa la versión de inmediato.
const volverAPestana = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

const browser = await chromium.launch();
try {
  // 1. Panel: misma versión → sin aviso; versión nueva → aviso con botón, sin recarga automática
  const contexto = await browser.newContext({ locale: "es-MX" });
  const p = await contexto.newPage();
  p.on("pageerror", (e) => console.error("Error en la página:", e.message));
  const real = await (await fetch(`${APP}/api/despliegue`)).json();
  if (typeof real.despliegue !== "string" || !real.despliegue) throw new Error(`/api/despliegue respondió ${JSON.stringify(real)}`);

  await entrar(p, DUENO, "/panel");
  await p.waitForURL(`${APP}/alta-empresa`);
  await p.getByLabel("Razón social o nombre del negocio").fill(`Fonda La Versión ${sufijo}`);
  await p.getByLabel("Sí, puede salir").check();
  await p.getByRole("button", { name: "Crear empresa" }).click();
  await p.waitForURL(`${APP}/panel`);
  await esperar(1500);
  if (await p.getByText(AVISO).isVisible()) throw new Error("Sin despliegue nuevo no debía aparecer el aviso");
  paso("con la misma versión no aparece el aviso");

  await despliegueNuevo(p, true);
  await marcar(p);
  await volverAPestana(p);
  await p.getByText(AVISO).waitFor();
  await esperar(3000);
  if (await recargada(p)) throw new Error("El panel no debía recargarse solo");
  paso("con versión nueva el panel muestra el aviso y no se recarga solo");

  await despliegueNuevo(p, false);
  await p.getByRole("button", { name: "Actualizar" }).click();
  await p.waitForLoadState("load");
  await p.getByRole("heading", { level: 1 }).first().waitFor();
  await esperar(1500);
  if (!(await recargada(p))) throw new Error("El botón Actualizar no recargó la página");
  if (await p.getByText(AVISO).isVisible()) throw new Error("Tras actualizar no debía seguir el aviso");
  paso("Actualizar recarga la página y el aviso desaparece");
  await contexto.close();

  // 2. Kiosco: no se recarga mientras alguien teclea; sí cuando vuelve al reposo
  sql(`insert into miembros (empresa_id, user_id, rol, centro_trabajo_id)
       select '${EMPRESA}', id, 'kiosco', '${CENTRO}' from auth.users where email = '${KIOSCO}' on conflict do nothing`);
  const ck = await browser.newContext({ viewport: { width: 800, height: 1280 }, locale: "es-MX" });
  const k = await ck.newPage();
  k.on("pageerror", (e) => console.error("Error en la página:", e.message));
  await entrar(k, KIOSCO, "/kiosco");
  await k.waitForURL(`${APP}/kiosco`);
  if (!(await k.getByRole("heading", { name: "Número de empleado" }).isVisible())) {
    // La cuenta se creó al entrar: ahora sí se le asigna el rol.
    sql(`insert into miembros (empresa_id, user_id, rol, centro_trabajo_id)
         select '${EMPRESA}', id, 'kiosco', '${CENTRO}' from auth.users where email = '${KIOSCO}' on conflict do nothing`);
    await k.reload();
  }
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor();

  await k.getByRole("button", { name: "1", exact: true }).click(); // alguien empieza a teclear
  await despliegueNuevo(k, true);
  await marcar(k);
  await volverAPestana(k);
  await esperar(13_000);
  if (await recargada(k)) throw new Error("El kiosco se recargó mientras alguien tecleaba");
  if (await k.getByText(AVISO).isVisible()) throw new Error("El kiosco no muestra el aviso del panel");
  paso("el kiosco no se recarga mientras alguien lo usa");

  await k.getByRole("button", { name: "Borrar" }).click(); // vuelve al reposo
  for (let i = 0; i < 30 && !(await recargada(k).catch(() => false)); i++) await esperar(1000);
  if (!(await recargada(k))) throw new Error("El kiosco en reposo no se recargó con la versión nueva");
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor();
  paso("el kiosco en reposo se recarga solo con la versión nueva");

  // Si tras recargar siguiera viendo otra versión (aquí la simulación sigue activa), no entra
  // en un ciclo de recargas.
  await marcar(k);
  await volverAPestana(k);
  await esperar(15_000);
  if (await recargada(k)) throw new Error("El kiosco volvió a recargarse: posible ciclo de recargas");
  paso("no hay ciclo de recargas: como máximo una recarga automática cada 10 minutos");

  console.log("\nPrueba de actualización: OK");
} finally {
  await browser.close();
}
