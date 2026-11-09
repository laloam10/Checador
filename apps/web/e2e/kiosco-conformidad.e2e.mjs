// Prueba de punta a punta: conformidad semanal desde el kiosco con número y PIN.
// Requisitos: los de kiosco.e2e.mjs (semilla.sql y semilla-kiosco.sql cargadas, app en marcha).
// Uso: node apps/web/e2e/kiosco-conformidad.e2e.mjs   (CAPTURA=archivo.png guarda la pantalla de la semana)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO = "kiosco.centro@ejemplo.mx";
const EMPRESA = "aaaaaaaa-0000-0000-0000-000000000001";
const CENTRO = "aaaaaaaa-0000-0000-0000-000000000002";
const ZONA = "America/Mexico_City";

const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();

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

// --- Datos: una persona nueva (solo kiosco) con checadas en las dos semanas anteriores ---
const numero = String(Date.now()).slice(-6);
const PIN = "4826";
const dueno = sql(`select user_id from miembros where empresa_id = '${EMPRESA}' and rol = 'propietario' limit 1`);
const trabajador = sql(`
  insert into trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values ('${EMPRESA}', '${CENTRO}', 'Nora Kiosco', '${numero}', '2026-01-01') returning id`).split("\n").pop();
const [pasada, antepasada] = sql(`
  select (date_trunc('week', now() at time zone '${ZONA}')::date - 7) || ' ' || (date_trunc('week', now() at time zone '${ZONA}')::date - 14)`).split(" ");
const en = (lunes, dias, hora) => `((date '${lunes}' + ${dias})::timestamp + time '${hora}') at time zone '${ZONA}'`;
sql(`
  select set_config('request.jwt.claim.sub', '${dueno}', false);
  select public.asignar_pin('${trabajador}', '${PIN}');
  insert into eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values
    ('${EMPRESA}', '${trabajador}', 'entrada', 'panel', 'Prueba', ${en(antepasada, 2, "09:00")}),
    ('${EMPRESA}', '${trabajador}', 'salida',  'panel', 'Prueba', ${en(antepasada, 2, "18:00")}),
    ('${EMPRESA}', '${trabajador}', 'entrada', 'panel', 'Prueba', ${en(pasada, 1, "08:00")}),
    ('${EMPRESA}', '${trabajador}', 'salida',  'panel', 'Prueba', ${en(pasada, 1, "17:00")});`);
sql(`insert into miembros (empresa_id, user_id, rol, centro_trabajo_id)
     select '${EMPRESA}', id, 'kiosco', '${CENTRO}' from auth.users where email = '${CORREO}' on conflict do nothing`);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 800, height: 1280 }, locale: "es-MX" })).newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));

async function teclear(texto) {
  for (const d of texto) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
}
async function identificarse() {
  await page.getByRole("heading", { name: "Número de empleado" }).waitFor();
  await teclear(numero);
  await page.getByRole("heading", { name: "PIN" }).waitFor();
  await teclear(PIN);
}

try {
  await page.goto(`${APP}/kiosco`);
  if (page.url().includes("/entrar")) {
    const desde = Date.now() - 1000;
    await page.getByLabel("Tu correo").fill(CORREO);
    await page.getByRole("button", { name: "Enviarme un código" }).click();
    await page.getByLabel("Código").fill(await codigo(desde));
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(`${APP}/kiosco`);
  }

  // 1. Al identificarse ve que tiene 2 semanas por revisar
  await identificarse();
  await page.getByRole("button", { name: "Revisar mis horas (2 semanas)" }).click();
  await page.getByRole("heading", { name: /^Semana del / }).waitFor();
  await page.locator(".kiosco-semana .tabla").getByText("18:00").waitFor();
  await page.getByText("te quedan 2 semanas por revisar").waitFor();
  if (process.env.CAPTURA) await page.screenshot({ path: process.env.CAPTURA, fullPage: true });
  paso("con su PIN ve la semana más antigua pendiente, con la misma tabla que la app");

  // 2. Objeta la primera
  await page.getByRole("button", { name: "Algo no es correcto" }).click();
  if (!(await page.getByRole("button", { name: "Enviar objeción" }).isDisabled())) throw new Error("Debía exigir una explicación");
  await page.getByLabel("¿Qué no es correcto?").fill("El miércoles salí a las 19:00.");
  await page.getByRole("button", { name: "Enviar objeción" }).click();
  await page.getByText(/Objetaste la semana .* \(registro n\.º \d+\)/).waitFor();
  paso("objeta la primera semana con su explicación y pasa sola a la siguiente");

  // 3. Confirma la segunda
  await page.locator(".kiosco-semana .tabla").getByText("17:00").waitFor();
  await page.getByRole("button", { name: "Mis horas son correctas" }).click();
  await page.getByRole("heading", { name: "Semana confirmada" }).waitFor();
  paso("confirma la segunda y recibe su número de registro");

  // 4. En la base
  const filas = sql(`
    select periodo_inicio || '|' || respuesta || '|' || coalesce(comentario, '') || '|' || (evidencia ->> 'modalidad') || '|'
           || (resumen -> 'totales' ->> 'trabajadoMin') || '|' || jsonb_array_length(resumen -> 'eventoIds')
      from conformidades where trabajador_id = '${trabajador}' order by periodo_inicio`).split("\n");
  const esperado = [
    `${antepasada}|objeta|El miércoles salí a las 19:00.|pin_kiosco|540|2`,
    `${pasada}|conforme||pin_kiosco|540|2`,
  ];
  if (JSON.stringify(filas) !== JSON.stringify(esperado)) throw new Error(`Conformidades inesperadas: ${JSON.stringify(filas)}`);
  paso("en la base: objeción y conformidad firmadas con PIN, con el resumen calculado en el servidor (9 h cada semana)");

  // 5. Ya no hay semanas pendientes
  await page.getByRole("heading", { name: "Número de empleado" }).waitFor({ timeout: 10000 });
  await identificarse();
  await page.getByRole("heading", { name: /^Hola, Nora/ }).waitFor();
  if (await page.getByRole("button", { name: /Revisar mis horas/ }).count()) throw new Error("No debían quedar semanas por revisar");
  paso("al volver a identificarse ya no tiene semanas por revisar");

  console.log("\nPrueba de conformidad en el kiosco: OK");
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
