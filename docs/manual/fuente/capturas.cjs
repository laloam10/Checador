// Recorre Checador (local) como dueño, trabajadora y kiosco, y toma las capturas del manual.
// Requisitos y uso: ver README.md de esta carpeta.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const path = require("path");
const os = require("os");

const OUT = path.join(__dirname, "img");
const APP = "http://127.0.0.1:3000";
const MAILPIT = "http://127.0.0.1:54324";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Lunes de la semana de ejemplo (debe ser una semana ya terminada para poder dar conformidad).
const LUNES = process.env.LUNES_PASADO || "2026-10-26";
const masDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const INGRESO = masDias(LUNES, -25);
const s = Date.now().toString(36).slice(-5);
const C = {
  dueno: `lupita.${s}@tortilleria-demo.mx`,
  maria: `maria.${s}@tortilleria-demo.mx`,
  rosa: `rosa.${s}@tortilleria-demo.mx`,
  kiosco: `kiosco.${s}@tortilleria-demo.mx`,
};
const EMPRESA = `Tortillería Doña Lupita`;
const sql = (q) => execFileSync("psql", [DB, "-XtAc", q], { encoding: "utf8" }).trim();
const log = (t) => console.log("✓", t);

async function codigo(correo, desde) {
  for (let i = 0; i < 40; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) {
      const c = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
      if (c) return c;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el código a ${correo}`);
}

async function entrar(page, correo, destino, capturas) {
  await page.goto(`${APP}/entrar${destino ? `?siguiente=${encodeURIComponent(destino)}` : ""}`);
  await page.getByLabel("Tu correo").fill(correo);
  if (capturas) await page.screenshot({ path: `${OUT}/01-entrar-correo.png` });
  const desde = Date.now() - 1000;
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByLabel("Código").waitFor();
  const cod = await codigo(correo, desde);
  await page.getByLabel("Código").fill(cod);
  if (capturas) await page.screenshot({ path: `${OUT}/02-entrar-codigo.png` });
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
}

const shot = (page, nombre, opciones = {}) => page.screenshot({ path: `${OUT}/${nombre}.png`, ...opciones });
const shotEl = (loc, nombre) => loc.screenshot({ path: `${OUT}/${nombre}.png` });
const estado = (p, t) => p.getByRole("status").filter({ hasText: t }).first().waitFor();

(async () => {
  const b = await chromium.launch();
  const escritorio = await b.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2, locale: "es-MX" });
  const celular = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-MX" });
  const tableta = await b.newContext({ viewport: { width: 820, height: 1100 }, deviceScaleFactor: 2, locale: "es-MX" });
  const d = await escritorio.newPage();
  const m = await celular.newPage();
  const k = await tableta.newPage();

  // ---------- Dueño: alta de empresa ----------
  await entrar(d, C.dueno, "/panel");
  await d.waitForURL(`${APP}/alta-empresa`);
  await d.getByLabel("Razón social o nombre del negocio").fill(EMPRESA);
  await d.getByLabel("RFC (opcional)").fill("TDL0101011A2");
  await d.getByLabel("Nombre de tu primer centro de trabajo").fill("Matriz");
  await d.getByLabel("Sí, puede salir").check();
  await shot(d, "03-alta-empresa", { fullPage: true });
  await d.getByRole("button", { name: "Crear empresa" }).click();
  await d.waitForURL(`${APP}/panel`);
  await d.getByText(/Primeros pasos/).waitFor();
  await shot(d, "04-tablero-primeros-pasos", { fullPage: true });
  log("empresa");

  // ---------- Dueño: personal ----------
  const altas = [
    { nombre: "María López", numero: "101", email: C.maria },
    { nombre: "José Hernández", numero: "102" },
    { nombre: "Rosa Díaz", numero: "103", email: C.rosa },
  ];
  for (const [i, t] of altas.entries()) {
    await d.goto(`${APP}/panel/trabajadores`);
    await d.getByRole("heading", { name: "Dar de alta" }).waitFor();
    await d.getByLabel("Nombre completo").fill(t.nombre);
    await d.getByLabel("Número de empleado").fill(t.numero);
    if (t.email) await d.getByLabel("Correo (opcional)").fill(t.email);
    await d.getByLabel("Fecha de ingreso").fill(INGRESO);
    if (i === 0) await shotEl(d.locator("form").filter({ has: d.getByRole("button", { name: "Dar de alta", exact: true }) }), "05-alta-trabajador");
    await d.getByRole("button", { name: "Dar de alta" }).click();
    await d.getByRole("heading", { name: t.nombre }).waitFor();
    if (t.nombre === "José Hernández") {
      await d.getByLabel("Nuevo PIN (4 a 6 dígitos)").fill("3917");
      await d.getByRole("button", { name: "Asignar PIN" }).click();
      await estado(d, "PIN asignado");
      await shotEl(d.locator("h2", { hasText: "PIN para el kiosco" }).locator("xpath=following-sibling::form[1]"), "06-pin-trabajador");
    }
  }
  log("personal");

  // ---------- Horarios de la semana pasada (carga de ejemplo en la base local) ----------
  const empresaId = sql(`select id from empresas where razon_social = '${EMPRESA}' order by creado_en desc limit 1`);
  const duenoId = sql(`select id from auth.users where email = '${C.dueno}'`);
  const id = (n) => sql(`select id from trabajadores where empresa_id = '${empresaId}' and nombre = '${n}'`);
  const maria = id("María López"), jose = id("José Hernández");
  const filas = [];
  const dia = (fecha, t, ent, pi, pf, sal) => {
    const z = "America/Mexico_City";
    filas.push(`('${empresaId}','${t}','entrada','panel','Horario de ejemplo', ('${fecha} ${ent}'::timestamp at time zone '${z}'), null)`);
    filas.push(`('${empresaId}','${t}','inicio_pausa','panel','Horario de ejemplo', ('${fecha} ${pi}'::timestamp at time zone '${z}'), true)`);
    filas.push(`('${empresaId}','${t}','fin_pausa','panel','Horario de ejemplo', ('${fecha} ${pf}'::timestamp at time zone '${z}'), null)`);
    filas.push(`('${empresaId}','${t}','salida','panel','Horario de ejemplo', ('${fecha} ${sal}'::timestamp at time zone '${z}'), null)`);
  };
  for (const f of [0, 1, 2, 3, 4, 5].map((n) => masDias(LUNES, n))) {
    dia(f, maria, "08:00", "14:00", "15:00", "17:00");
    dia(f, jose, "07:00", "12:00", "13:00", f === masDias(LUNES, 3) ? "19:00" : "16:00");
  }
  execFileSync("psql", [DB, "-Xq", "-v", "ON_ERROR_STOP=1", "-c",
    `select set_config('request.jwt.claim.sub', '${duenoId}', false);
     insert into eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva, puede_salir) values ${filas.join(",")};`]);
  log("horarios de ejemplo");

  // ---------- Dueño: acuerdos en lote, accesos y centros ----------
  await d.goto(`${APP}/panel/trabajadores`);
  await d.getByText(/Ver el texto \(ejemplo:/).click();
  await shotEl(d.locator("#acuerdos"), "08-acuerdos-en-lote");
  await d.getByLabel(/Revisé el texto y firmo estos acuerdos/).check();
  await d.getByRole("button", { name: /Generar y firmar 3 acuerdo/ }).click();
  await d.getByText("La empresa ya firmó el acuerdo de todo su personal.").waitFor();
  await shotEl(d.locator("table.tabla"), "07-lista-trabajadores");
  await d.goto(`${APP}/panel/accesos`);
  await d.getByRole("heading", { name: "Accesos" }).waitFor();
  await d.getByLabel("Correo").fill(C.kiosco);
  await d.getByLabel("Centro (solo kiosco)").selectOption({ label: "Matriz" });
  await d.getByRole("button", { name: "Invitar" }).click();
  await estado(d, "Invitación creada");
  await shot(d, "09-accesos", { fullPage: true });
  await d.goto(`${APP}/panel/centros`);
  await d.getByRole("heading", { name: "Centros de trabajo" }).waitFor();
  await shotEl(d.locator(".centro").first(), "10-centro");
  log("acuerdos, accesos y centros");

  // ---------- Trabajadora (celular) ----------
  await entrar(m, C.maria, "/", true);
  await m.getByRole("link", { name: /Tu empleador te envió el acuerdo/ }).waitFor();
  await shot(m, "11-app-inicio-aviso");
  await m.goto(`${APP}/acuerdo`);
  await m.locator("pre.texto-acuerdo").waitFor();
  await shot(m, "12-app-acuerdo");
  await m.getByLabel(/Leí el acuerdo completo/).check();
  await shotEl(m.locator(".tarjeta").filter({ hasText: "Firmar acuerdo" }), "12b-app-firmar");
  await m.getByRole("button", { name: "Firmar acuerdo" }).click();
  await m.getByText(/Acuerdo vigente: versión 1/).waitFor();
  await m.goto(APP);
  await m.getByRole("button", { name: "Registrar entrada" }).click();
  await m.getByText(/Trabajando desde las/).waitFor();
  await shot(m, "13-app-trabajando");
  await m.goto(`${APP}/registros?semana=${LUNES}`);
  await m.getByText("Total").waitFor();
  await shot(m, "14-app-registros", { fullPage: true });
  await m.getByRole("button", { name: "Algo no es correcto" }).click();
  await m.getByLabel("¿Qué no es correcto?").fill("El jueves salí a las 18:00, no a las 17:00.");
  await shotEl(m.locator(".tarjeta").filter({ hasText: "¿Qué no es correcto?" }), "14b-app-objetar");
  await m.getByRole("button", { name: "Enviar objeción" }).click();
  await m.getByText("Objetaste esta semana").waitFor();
  await m.goto(`${APP}/pin`);
  await m.getByRole("heading", { name: "Mi PIN para el kiosco" }).waitFor();
  await shot(m, "15-app-pin");
  log("trabajadora");

  // ---------- Kiosco (tableta) ----------
  await entrar(k, C.kiosco, "/kiosco");
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor();
  const teclear = async (v) => { for (const c of v) await k.getByRole("button", { name: c, exact: true }).click(); };
  await teclear("102");
  await shot(k, "16-kiosco-numero");
  await k.getByRole("button", { name: "Continuar" }).click();
  await teclear("3917");
  await shot(k, "17-kiosco-pin");
  await k.getByRole("button", { name: "Continuar" }).click();
  await k.getByRole("heading", { name: "Hola, José" }).waitFor();
  await shot(k, "18-kiosco-acciones");
  await k.getByRole("button", { name: "Tienes un acuerdo por firmar" }).click();
  await k.locator("pre.texto-acuerdo").waitFor();
  await shot(k, "19-kiosco-acuerdo");
  await k.getByRole("button", { name: "Leí el acuerdo y lo firmo con mi PIN" }).click();
  await k.getByText("Acuerdo firmado").waitFor();
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor({ timeout: 10000 });
  await teclear("102"); await k.getByRole("button", { name: "Continuar" }).click();
  await teclear("3917"); await k.getByRole("button", { name: "Continuar" }).click();
  await k.getByRole("button", { name: "Registrar entrada" }).click();
  await k.getByText("Entrada registrada").waitFor();
  await shot(k, "20-kiosco-listo");
  // Revisión de semanas en el kiosco (José no tiene correo: aquí da su conformidad)
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor({ timeout: 10000 });
  await teclear("102"); await k.getByRole("button", { name: "Continuar" }).click();
  await teclear("3917"); await k.getByRole("button", { name: "Continuar" }).click();
  await k.getByRole("button", { name: /Revisar mis horas/ }).click();
  await k.locator(".kiosco-semana .tabla").waitFor();
  await shot(k, "27-kiosco-semana", { fullPage: true });
  await k.getByRole("button", { name: "Ahora no" }).click();
  log("kiosco");

  // ---------- Dueño: tablero, registros, corrección, objeciones, exportación ----------
  await d.goto(`${APP}/panel`);
  await d.getByRole("heading", { name: "En turno ahora" }).waitFor();
  await shot(d, "21-tablero", { fullPage: true });
  await d.goto(`${APP}/panel/trabajadores/${jose}/semana?semana=${LUNES}`);
  await d.getByRole("heading", { name: "Bitácora de la semana" }).waitFor();
  const alto = await d.evaluate(() => document.querySelector("main table.tabla").getBoundingClientRect().bottom + window.scrollY + 16);
  await d.setViewportSize({ width: 1180, height: Math.ceil(alto) });
  await shot(d, "22-semana-tabla");
  await d.setViewportSize({ width: 1180, height: 860 });
  await d.goto(`${APP}/panel/trabajadores/${jose}/semana`);
  await d.getByRole("heading", { name: "Bitácora de la semana" }).waitFor();
  const reg = d.locator(".bitacora li").filter({ hasText: "kiosco" }).first();
  await reg.getByText("Corregir o anular").click();
  const ahora = await d.evaluate(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" }).format(new Date()));
  const [fecha, hora] = ahora.split(" ");
  const [hh, mm] = hora.split(":").map(Number);
  const antes = `${String(Math.max(0, hh - 1)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  await reg.getByLabel("Hora correcta").fill(`${fecha}T${antes}`);
  await reg.getByLabel("Motivo", { exact: true }).fill("Llegó una hora antes; el kiosco estaba sin conexión");
  await reg.getByRole("button", { name: "Corregir hora" }).click();
  await estado(d, "Corrección registrada");
  await d.locator(".bitacora li").filter({ hasText: "Corregida a" }).first().locator("details").evaluate((x) => (x.open = false));
  await shotEl(d.locator(".bitacora"), "23-bitacora-correccion");
  await d.goto(`${APP}/panel/objeciones`);
  await d.getByRole("heading", { name: "Objeciones por atender" }).waitFor();
  await shot(d, "24-objeciones", { fullPage: true });
  await d.goto(`${APP}/panel/exportar`);
  await d.getByRole("heading", { name: "Exportar para inspección o juicio" }).waitFor();
  await d.locator("select[name=trabajador]").selectOption({ label: "María López" });
  await d.locator("input[name=desde]").fill(LUNES);
  await d.locator("input[name=hasta]").fill(masDias(LUNES, 6));
  const [desc] = await Promise.all([d.waitForEvent("download"), d.getByRole("button", { name: "Exportar" }).click()]);
  await desc.saveAs(path.join(os.tmpdir(), "checador-constancia-ejemplo.pdf"));
  await d.getByRole("status").filter({ hasText: "Huella SHA-256" }).waitFor();
  await shot(d, "25-exportar", { fullPage: true });
  const rosa = id("Rosa Díaz");
  await d.goto(`${APP}/panel/trabajadores/${rosa}`);
  await d.getByText("Registrar firma en papel").click();
  await shotEl(d.locator(".mensaje-aviso").filter({ hasText: "pendiente de firma" }), "26-acuerdo-pendiente-papel");
  // Configuración, alta masiva y panel en el celular
  await d.goto(`${APP}/panel/configuracion`);
  await d.getByRole("switch", { name: "Recordatorios de conformidad por correo" }).waitFor();
  await shot(d, "28-configuracion", { fullPage: true });
  await d.goto(`${APP}/panel/trabajadores`);
  await d.getByText("Dar de alta a varias personas desde Excel").click();
  await shotEl(d.locator("#alta-masiva"), "29-alta-masiva");
  await shotEl(d.locator("form.filtros"), "29b-filtros");
  const cel = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-MX", storageState: await escritorio.storageState() });
  const pc = await cel.newPage();
  await pc.goto(`${APP}/panel/trabajadores`);
  await pc.getByRole("navigation", { name: "Secciones del panel" }).waitFor();
  await pc.locator(".barra-mas summary").click();
  await shot(pc, "30-panel-celular");
  log("panel");

  await b.close();
  console.log("Capturas en", OUT);
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
