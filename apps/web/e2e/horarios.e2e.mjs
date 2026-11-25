// Prueba de punta a punta de los horarios: Configuración, ficha, jornada calculada, señales en la
// semana, tablero y horario en la app de la persona. Contra Supabase local (con Mailpit).
// Uso: node apps/web/e2e/horarios.e2e.mjs   (requiere la app y Supabase local)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (q) => execFileSync("psql", [DB, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const paso = (t) => console.log(`✓ ${t}`);
const afirmar = (c, d) => { if (!c) throw new Error(`FALLO: ${d}`); paso(d); };
const s = Date.now().toString(36);
const DUENO = `dueno.horarios.${s}@ejemplo.mx`;
const ROSA = `rosa.horarios.${s}@ejemplo.mx`;
const ZONA = "America/Mexico_City";

async function entrar(page, correo, destino) {
  await page.goto(`${APP}${destino}`);
  await page.waitForURL(/\/entrar/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(correo);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  let codigo;
  for (let i = 0; i < 40 && !codigo; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) codigo = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
    if (!codigo) await new Promise((r) => setTimeout(r, 500));
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
}
const estado = (page, texto) => page.getByRole("status").filter({ hasText: texto }).first().waitFor();

const browser = await chromium.launch();
const d = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-MX" })).newPage();
const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-MX" })).newPage();
for (const p of [d, m]) p.on("pageerror", (e) => console.error("Error en la página:", e.message));

try {
  // --- Empresa (pausa: se puede salir a comer) ---
  await entrar(d, DUENO, "/panel");
  await d.waitForURL(`${APP}/alta-empresa`);
  await d.getByLabel("Razón social o nombre del negocio").fill(`Horarios ${s}`);
  await d.getByLabel(/Sí, puede salir/).check();
  await d.getByRole("button", { name: "Crear empresa" }).click();
  await d.waitForURL(`${APP}/panel`);
  const empresa = sql(`select id from public.empresas where razon_social = 'Horarios ${s}'`);
  const centro = sql(`select id from public.centros_trabajo where empresa_id = '${empresa}'`);
  const dueno = sql(`select id from auth.users where email = '${DUENO}'`);

  // --- Configuración: crear un horario y hacerlo el de la empresa ---
  await d.goto(`${APP}/panel/configuracion`);
  await d.getByRole("heading", { name: "Horarios" }).waitFor();
  const nuevo = d.locator(".nuevo-horario");
  await nuevo.getByLabel("Nombre").fill("Matutino");
  await nuevo.getByLabel("Lunes: entrada").fill("08:00");
  await nuevo.getByLabel("Lunes: salida").fill("07:00");
  await nuevo.getByRole("button", { name: "Crear horario" }).click();
  await estado(d, "Lunes: el turno no puede durar más de 16 horas.");
  paso("un horario sin sentido se rechaza con un mensaje claro");
  await nuevo.getByLabel("Lunes: salida").fill("17:00");
  await nuevo.getByLabel("Lunes: comida desde").fill("13:00");
  await nuevo.getByLabel("Lunes: comida hasta").fill("14:00");
  for (const dia of ["Martes", "Miércoles", "Jueves", "Viernes"]) {
    await nuevo.getByLabel(`${dia}: entrada`).fill("08:00");
    await nuevo.getByLabel(`${dia}: salida`).fill("17:00");
    await nuevo.getByLabel(`${dia}: comida desde`).fill("13:00");
    await nuevo.getByLabel(`${dia}: comida hasta`).fill("14:00");
  }
  await nuevo.getByRole("button", { name: "Crear horario" }).click();
  await estado(d, "Horario «Matutino» creado.");
  await d.reload();
  const resumen = d.locator(".horarios li", { hasText: "Matutino" });
  await resumen.getByText("Lun–Vie 08:00–17:00 (comida 13:00–14:00)", { exact: true }).waitFor();
  await resumen.getByText("Tolerancia 10 min · 0 personas", { exact: true }).waitFor();
  paso("el horario se crea y se resume por días");
  const matutino = sql(`select id from public.horarios where empresa_id = '${empresa}' and nombre = 'Matutino'`);
  await d.getByLabel("Horario de la empresa (para quien no tiene uno propio)").selectOption({ label: "Matutino" });
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await estado(d, "Horario de la empresa guardado.");
  paso("se elige como horario de la empresa");

  // --- Alta: la jornada sale del horario ---
  await d.goto(`${APP}/panel/trabajadores`);
  await d.getByRole("heading", { name: "Dar de alta" }).waitFor();
  const alta = d.locator("form").filter({ has: d.getByRole("button", { name: "Dar de alta", exact: true }) });
  await alta.getByLabel("Nombre completo").fill("Rosa Horario");
  await alta.getByLabel("Número de empleado").fill("501");
  await alta.getByLabel("Correo (opcional)").fill(ROSA);
  await alta.getByLabel("Fecha de ingreso").fill("2026-01-05");
  afirmar(await alta.getByLabel("Horario").inputValue() === "", "en el alta, el horario por omisión es el de la empresa");
  afirmar(!(await alta.locator(".jornada-manual").isVisible()) && await alta.locator(".jornada-horario").isVisible(),
    "con horario, la jornada no se captura a mano");
  await alta.getByLabel("Horario").selectOption("sin");
  afirmar(await alta.locator(".jornada-manual").isVisible(), "con «Sin horario fijo» vuelve a aparecer la jornada a mano");
  await alta.getByLabel("Horario").selectOption("");
  await alta.getByRole("button", { name: "Dar de alta" }).click();
  await d.getByRole("heading", { name: "Rosa Horario" }).waitFor();
  const rosa = sql(`select id from public.trabajadores where empresa_id = '${empresa}' and nombre = 'Rosa Horario'`);
  afirmar(sql(`select jornada_pactada_min::text from public.trabajadores where id = '${rosa}'`) === '{"1": 480, "2": 480, "3": 480, "4": 480, "5": 480}',
    "la jornada pactada se calcula del horario: 8 h de lunes a viernes (sin la comida)");

  // --- Señales en la semana: lunes pasado entró 08:25 y salió 16:30 ---
  const lunes = sql(`select (date_trunc('week', now() at time zone '${ZONA}')::date - 7)::text`);
  sql(`select set_config('request.jwt.claim.sub', '${dueno}', false); set role authenticated;
       insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values
       ('${empresa}', '${rosa}', 'entrada', 'panel', 'Prueba', ('${lunes}'::date + time '08:25') at time zone '${ZONA}'),
       ('${empresa}', '${rosa}', 'salida', 'panel', 'Prueba', ('${lunes}'::date + time '16:30') at time zone '${ZONA}');`);
  await d.goto(`${APP}/panel/trabajadores/${rosa}/semana?semana=${lunes}`);
  await d.getByText("Horario Matutino").waitFor();
  await d.locator(".senal", { hasText: "25 min tarde" }).waitFor();
  await d.locator(".senal", { hasText: "salió 30 min antes" }).waitFor();
  paso("la semana muestra el horario y las señales del día (25 min tarde, salió 30 min antes)");

  // --- Tablero: horario que empezó hace 30 min (hora del centro) ---
  const [hh, mi, dow] = sql(`select to_char(now() at time zone '${ZONA}' - interval '30 minutes', 'HH24:MI') || ' ' || to_char(now() at time zone '${ZONA}' + interval '4 hours', 'HH24:MI') || ' ' || extract(dow from now() at time zone '${ZONA}')`).split(" ");
  const horaLocal = Number(sql(`select extract(hour from now() at time zone '${ZONA}')`));
  if (horaLocal >= 1 && horaLocal <= 19) {
    sql(`select set_config('request.jwt.claim.sub', '${dueno}', false); set role authenticated;
         insert into public.horarios (empresa_id, nombre, dias) values ('${empresa}', 'Ahora', '{"${dow}": {"entrada": "${hh}", "salida": "${mi}"}}');
         insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, horario_id, dia_descanso)
           select '${empresa}', '${centro}', n, num, '2026-01-05', (select id from public.horarios where empresa_id = '${empresa}' and nombre = 'Ahora'), (${dow} + 3) % 7
             from (values ('Tomás Tarde', '502'), ('Sara Sin Entrada', '503')) v(n, num);
         insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
           select '${empresa}', id, 'entrada', 'panel', 'Prueba', now() - interval '10 minutes' from public.trabajadores where nombre = 'Tomás Tarde' and empresa_id = '${empresa}';`);
    await d.goto(`${APP}/panel`);
    await d.getByRole("heading", { name: "Frente al horario de hoy" }).waitFor();
    await d.locator(".horario-hoy li", { hasText: "Sara Sin Entrada" }).getByText("Sin checar entrada").waitFor();
    await d.locator(".horario-hoy li", { hasText: "Tomás Tarde" }).getByText("20 min tarde").waitFor();
    paso("el tablero muestra quién no ha checado entrada y quién llegó tarde");
  } else {
    console.log("· (tablero) se omite: a esta hora no cabe un horario de prueba en el día");
  }

  // --- La persona ve su horario ---
  await entrar(m, ROSA, "/");
  await m.waitForURL(`${APP}/`);
  const hoyDow = Number(sql(`select extract(dow from now() at time zone '${ZONA}')`));
  const texto = await m.locator(".horario-trabajador").innerText();
  afirmar(hoyDow >= 1 && hoyDow <= 5 ? texto.includes("Tu horario de hoy: 08:00 a 17:00 · comida 13:00–14:00") : texto === "Hoy no tienes turno en tu horario.",
    "la persona ve su horario de hoy en la pantalla de checar");

  // --- Cambiar el horario recalcula la jornada; borrar lo quita ---
  sql(`select set_config('request.jwt.claim.sub', '${dueno}', false); set role authenticated;
       update public.horarios set dias = jsonb_set(dias, '{1,salida}', '"15:00"') where id = '${matutino}';`);
  afirmar(sql(`select jornada_pactada_min ->> '1' from public.trabajadores where id = '${rosa}'`) === "360", "al cambiar el horario se recalcula su jornada");
  await d.goto(`${APP}/panel/configuracion`);
  const item = d.locator(".horarios li", { hasText: "Matutino" });
  await item.locator("summary").click();
  await item.getByLabel("Escribe BORRAR para confirmar").fill("BORRAR");
  await item.getByRole("button", { name: "Borrar horario" }).click();
  // Al borrarlo, el horario (y su aviso) desaparecen de la lista: esa es la confirmación.
  await d.locator(".horarios li", { hasText: "Matutino" }).waitFor({ state: "detached" });
  afirmar(sql(`select horario_predeterminado is null from public.empresas where id = '${empresa}'`) === "t", "al borrarlo deja de ser el de la empresa");

  console.log("\nHorarios: todo correcto.");
} catch (e) {
  await d.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
