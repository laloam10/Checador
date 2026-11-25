// Recorre Checador (local) como dueño, trabajadora y kiosco, y toma las capturas del manual.
// Requisitos y uso: ver README.md de esta carpeta.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const path = require("path");
const os = require("os");

const OUT = path.join(__dirname, "img");
// localhost y no 127.0.0.1: la huella (WebAuthn) no acepta direcciones IP.
const APP = "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:54324";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// El mismo secreto con que corre la app (ACCESO_SECRETO_SERVICIO), para la captura de la huella.
const SECRETO_ACCESO = process.env.ACCESO_SECRETO_SERVICIO;
if (!SECRETO_ACCESO) throw new Error("Falta ACCESO_SECRETO_SERVICIO (el mismo con que corre la app).");
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
/** Posición de un elemento dentro de la página completa (no de la ventana, que puede estar desplazada). */
const caja = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; });
/** Captura desde el borde superior de `arriba` hasta el inferior de `abajo`, con margen. */
async function shotEntre(page, arriba, abajo, nombre, margen = 8) {
  const a = await caja(arriba);
  const b = await caja(abajo);
  const x = Math.min(a.x, b.x) - margen;
  const ancho = Math.max(a.x + a.width, b.x + b.width) + margen - x;
  await page.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: true, clip: { x, y: a.y - margen, width: ancho, height: b.y + b.height - a.y + 2 * margen } });
}
const estado = (p, t) => p.getByRole("status").filter({ hasText: t }).first().waitFor();

(async () => {
  const b = await chromium.launch();
  const escritorio = await b.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2, locale: "es-MX" });
  // Agente de Android: el nombre del teléfono en Acceso → Huella o rostro sale de aquí.
  const celular = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-MX",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" });
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
      await shotEl(d.locator("section.grupo-campos", { has: d.getByRole("heading", { name: "PIN para el kiosco" }) }), "06-pin-trabajador");
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
  await m.locator(".texto-acuerdo").waitFor();
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
  // Acceso: PIN, huella (sensor virtual de Chromium) y Salir con bloqueo.
  sql(`select public.configurar_secreto_servicio('acceso', '${SECRETO_ACCESO}')`);
  const cdp = await celular.newCDPSession(m);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await m.goto(`${APP}/acceso`);
  await m.getByLabel("Nuevo PIN (4 a 6 dígitos)").fill("4826");
  await m.getByLabel("Confirma el PIN").fill("4826");
  await m.getByRole("button", { name: "Guardar PIN" }).click();
  await m.getByText("PIN guardado.").waitFor();
  await m.getByRole("button", { name: "Agregar la huella o el rostro de este teléfono" }).click();
  await m.getByText("Listo: ya puedes elegir volver a entrar con tu huella o rostro.").waitFor();
  await m.getByRole("radio", { name: /Volver a entrar con mi huella o rostro/ }).check();
  await m.getByText("Listo: al salir, volverás a entrar con tu huella o rostro.").waitFor();
  await m.reload();
  await m.getByText("Teléfono Android").waitFor();
  await m.evaluate(() => scrollTo(0, 0)); // al recargar, el navegador conserva la posición
  await shot(m, "15-app-acceso");
  await shotEl(m.locator("section.tarjeta").filter({ has: m.getByRole("heading", { name: "Huella o rostro" }) }), "15c-app-huella");
  await m.goto(APP);
  await m.getByRole("button", { name: "Salir" }).click();
  await m.waitForURL(`${APP}/desbloquear`);
  await m.getByRole("button", { name: "Entrar con huella o rostro" }).waitFor();
  await shot(m, "15b-app-desbloquear");
  await m.getByRole("button", { name: "Entrar con huella o rostro" }).click();
  await m.waitForURL(`${APP}/`);
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
  await k.locator(".texto-acuerdo").waitFor();
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
  await shotEl(d.locator(".acuerdo-version").filter({ hasText: "pendiente de firma" }), "26-acuerdo-pendiente-papel");
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

  // ---------- WhatsApp (la app debe correr con WHATSAPP_NUMERO; ver README) ----------
  // Al final para no cambiar las capturas anteriores: capturar el celular deja el acuerdo de José desactualizado.
  await d.goto(`${APP}/panel/trabajadores/${jose}`);
  await d.getByLabel("Celular para WhatsApp (opcional)").fill(`55${String(Date.now()).slice(-8)}`);
  await d.getByRole("button", { name: "Guardar cambios" }).click();
  await estado(d, "Datos actualizados");
  await d.locator(".estado-tile", { hasText: "WhatsApp" }).getByText("Pendiente de activar").waitFor();
  await shotEl(d.getByLabel("Celular para WhatsApp (opcional)").locator("xpath=ancestor::label[1]"), "31-ficha-celular");
  await d.getByRole("button", { name: "Generar código de activación" }).click();
  await d.getByAltText("Código QR para activar WhatsApp").waitFor();
  // El QR apunta a un número de ejemplo: se difumina para que nadie lo escanee desde el manual.
  await d.addStyleTag({ content: ".activacion-whatsapp img { filter: blur(5px); }" });
  await shotEl(d.locator("form.form-whatsapp"), "32-whatsapp-codigo");
  log("whatsapp");

  // ---------- Avisos de la trabajadora (la app debe correr con VAPID_PUBLICA) ----------
  // Chromium sin pantalla reporta el permiso de notificaciones como negado: se muestra como "aún no decidido".
  await celular.addInitScript(() => {
    if (self.Notification) Object.defineProperty(Notification, "permission", { get: () => "default" });
  });
  await m.goto(`${APP}/avisos`);
  await m.getByRole("button", { name: "Activar avisos en este teléfono" }).waitFor();
  await shot(m, "33-app-avisos", { fullPage: true });
  log("avisos");

  // ---------- Horarios ----------
  // Al final: el horario de la empresa recalcula la jornada pactada y deja acuerdos desactualizados.
  await d.goto(`${APP}/panel/configuracion`);
  const nuevoHorario = d.locator(".nuevo-horario");
  // Con horarios ya creados, el formulario está detrás de "+ Nuevo horario".
  const abrirNuevo = nuevoHorario.getByRole("button", { name: "+ Nuevo horario" });
  if (await abrirNuevo.isVisible()) await abrirNuevo.click();
  await nuevoHorario.getByLabel("Nombre").fill("Matutino");
  for (const dia of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]) {
    await nuevoHorario.getByLabel(`${dia}: entrada`).fill("08:00");
    await nuevoHorario.getByLabel(`${dia}: salida`).fill("17:00");
    await nuevoHorario.getByLabel(`${dia}: comida desde`).fill("13:00");
    await nuevoHorario.getByLabel(`${dia}: comida hasta`).fill("14:00");
  }
  await nuevoHorario.getByRole("checkbox", { name: "Sábado" }).check();
  await nuevoHorario.getByLabel("Sábado: entrada").fill("08:00");
  await nuevoHorario.getByLabel("Sábado: salida").fill("13:00");
  await nuevoHorario.getByLabel("Sábado: comida desde").fill("");
  await nuevoHorario.getByLabel("Sábado: comida hasta").fill("");
  await d.evaluate(() => document.activeElement?.blur());
  await shotEl(nuevoHorario, "34-horario-nuevo");
  await nuevoHorario.getByRole("button", { name: "Crear horario" }).click();
  await d.locator(".horarios li", { hasText: "Matutino" }).waitFor();
  await d.getByLabel("Horario de la empresa (para quien no tiene uno propio)").selectOption({ label: "Matutino" });
  await d.getByRole("button", { name: "Guardar", exact: true }).click();
  await estado(d, "Horario de la empresa guardado");
  await d.reload();
  await d.locator(".horarios li", { hasText: "De la empresa" }).waitFor();
  // Lista y horario de la empresa, sin el formulario de alta que va debajo.
  await shotEntre(d, d.locator("ul.horarios"), d.locator("form").filter({ has: d.getByLabel("Horario de la empresa (para quien no tiene uno propio)") }), "35-horarios-lista");
  await d.goto(`${APP}/panel/trabajadores/${jose}`);
  await d.getByLabel("Horario").waitFor();
  await shotEl(d.getByLabel("Horario").locator("xpath=ancestor::label[1]"), "36-ficha-horario");
  await d.goto(`${APP}/panel/trabajadores/${jose}/semana?semana=${LUNES}`);
  await d.locator(".senales").first().waitFor();
  await shotEl(d.locator(".semana-cabecera"), "37a-semana-horario");
  // El día con señales, hasta su primera checada.
  {
    const dia = d.locator(".bitacora-dia").filter({ has: d.locator(".senales") }).first();
    await shotEntre(d, dia.locator("h3"), dia.locator(".bitacora li").first(), "37-semana-senales", 12);
  }
  // Tablero: un turno que empezó hace 40 min (hora del centro), solo para la captura.
  const ZONA_M = "America/Mexico_City";
  const [ini, fin, dow, horaAhora] = sql(`select to_char(now() at time zone '${ZONA_M}' - interval '40 minutes', 'HH24:MI') || ' ' || to_char(now() at time zone '${ZONA_M}' + interval '4 hours', 'HH24:MI') || ' ' || extract(dow from now() at time zone '${ZONA_M}') || ' ' || extract(hour from now() at time zone '${ZONA_M}')`).split(" ");
  if (Number(horaAhora) >= 1 && Number(horaAhora) <= 19) {
    const rosaId = id("Rosa Díaz");
    sql(`insert into public.horarios (empresa_id, nombre, dias) values ('${empresaId}', 'Vespertino', '{"${dow}": {"entrada": "${ini}", "salida": "${fin}"}}');
         update public.trabajadores set horario_id = (select id from public.horarios where empresa_id = '${empresaId}' and nombre = 'Vespertino')
          where id in ('${jose}', '${rosaId}');
         insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
           values ('${empresaId}', '${rosaId}', 'entrada', 'panel', 'Ejemplo', now() - interval '18 minutes');
         insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, dia_descanso, horario_id)
           select '${empresaId}', centro_trabajo_id, 'Luis Pérez', '104', fecha_ingreso, (${dow} + 3) % 7, horario_id from public.trabajadores where id = '${rosaId}';`);
    await d.goto(`${APP}/panel`);
    await d.getByRole("heading", { name: "Frente al horario de hoy" }).waitFor();
    await shotEntre(d, d.getByRole("heading", { name: "Frente al horario de hoy" }).locator("xpath=.."), d.locator(".horario-hoy").locator("xpath=following-sibling::p[1]"), "38-tablero-horario");
  } else {
    console.warn("· 38-tablero-horario no se tomó: córrelo entre la 1:00 y las 19:00 (hora del centro).");
  }
  await m.goto(APP);
  await m.locator(".horario-trabajador").waitFor();
  await shot(m, "39-app-horario");
  log("horarios");

  await b.close();
  console.log("Capturas en", OUT);
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
