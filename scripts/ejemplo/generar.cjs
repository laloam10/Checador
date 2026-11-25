// Empresa de ejemplo "Cafetería Los Arcos SA de CV" con 5 personas y 3½ semanas de uso, para
// tomar capturas. SOLO contra el Supabase local (ver README.md de esta carpeta).
//
// Las checadas, acuerdos y conformidades pasadas se registran en orden cronológico con un
// "reloj de carga": mientras corre, los disparadores de eventos, acuerdos, firmas y
// conformidades toman la hora de la tabla public._reloj_carga en lugar de clock_timestamp().
// La cadena de la bitácora se calcula igual que siempre (y se verifica al final). Al terminar,
// o si algo falla, se restauran las funciones originales y se borra la tabla.
//
// Uso (desde la raíz del repositorio, con Supabase local y la app en :3000):
//   CHECADOR_EJEMPLO=local node scripts/ejemplo/generar.cjs
const { chromium } = require("playwright");
const { execFileSync, spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const AQUI = __dirname;
const SALIDA = path.join(AQUI, "salida"); // ignorada por git
const WEB = path.resolve(AQUI, "../../apps/web");
const ORIGINALES = path.join(SALIDA, "funciones-originales.sql");

// ---------- Protecciones: nunca contra pruebas ni producción ----------
// Las direcciones son fijas (no se leen de variables de entorno) salvo la base, que debe ser local.
const DB = process.env.EJEMPLO_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP = "http://127.0.0.1:3000";
const APP_FALSA = "http://127.0.0.1:3001";
const MAILPIT = "http://127.0.0.1:54324";
const esLocal = (url) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);

/** Hosts a los que la app deja conectar al navegador (connect-src de su CSP): ahí está su Supabase. */
async function supabaseDeLaApp(base) {
  const r = await fetch(`${base}/entrar`, { redirect: "manual" });
  const csp = r.headers.get("content-security-policy") ?? "";
  const fuentes = (/connect-src([^;]*)/.exec(csp)?.[1] ?? "").trim().split(/\s+/).filter((f) => /^(https?|wss?):\/\//.test(f));
  return fuentes;
}
async function verificarLocal() {
  if (process.env.CHECADOR_EJEMPLO !== "local") {
    throw new Error("Este generador modifica funciones de la base. Confírmalo con CHECADOR_EJEMPLO=local (solo Supabase local).");
  }
  if (!esLocal(DB)) throw new Error(`La base debe ser local (127.0.0.1 o localhost), no ${new URL(DB).hostname}.`);
  const fuentes = await supabaseDeLaApp(APP).catch(() => null);
  if (!fuentes) throw new Error(`La app no responde en ${APP}. Arráncala con el Supabase local (npm run dev o next start).`);
  if (!fuentes.length || fuentes.some((f) => !esLocal(f))) {
    throw new Error(`La app de ${APP} está conectada a ${fuentes.join(", ") || "un Supabase desconocido"}: debe usar el Supabase local.`);
  }
  // Mailpit solo existe en el Supabase local: de ahí se leen los códigos para entrar.
  if (!(await fetch(`${MAILPIT}/api/v1/info`).then((r) => r.ok).catch(() => false))) throw new Error("No responde Mailpit (Supabase local).");
  // Que la base de psql sea la misma que usa la app se comprueba al crear la cuenta del dueño
  // (la app la crea; si no aparece en esta base, se detiene antes de modificar nada).
  verificado = true;
}
let verificado = false;

const sql = (q) => execFileSync("psql", [DB, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const lit = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const log = (t) => console.log("✓", t);
const ZONA = "America/Mexico_City";

// ---------- Datos inventados ----------
const DOM = "cafeteria-demo.mx";
const C = {
  dueno: `alejandro.ruiz@${DOM}`, kiosco: `kiosco.matriz@${DOM}`,
  rosa: `rosa.mendoza@${DOM}`, daniela: `daniela.ortiz@${DOM}`, mariana: `mariana.torres@${DOM}`,
};
const EMPRESA = "Cafetería Los Arcos SA de CV";
const RFC = "CLA180612KJ3";
const MATRIZ = { nombre: "Matriz Centro", dir: "Av. Juárez 128, Col. Centro, Guadalajara, Jal.", lat: 20.67472, lon: -103.34781, radio: 120 };
const NORTE = { nombre: "Sucursal Plaza Norte", dir: "Av. Patria 1950, Local 14, Zapopan, Jal.", lat: 20.72031, lon: -103.39012, radio: 150 };

// ---------- Fechas: relativas a la semana en curso ----------
// Guadalajara usa la hora del centro de México (UTC−6 todo el año desde 2022).
const iso = (fecha, hhmm) => new Date(`${fecha}T${hhmm}:00-06:00`).toISOString();
const masDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dow = (f) => new Date(`${f}T12:00:00Z`).getUTCDay();
const sumarMin = (hhmm, m) => { const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + m; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const HOY = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const L0 = masDias(HOY, -((dow(HOY) + 6) % 7)); // lunes de esta semana
const L3 = masDias(L0, -21), L2 = masDias(L0, -14), L1 = masDias(L0, -7);
const ALTA = masDias(L3, -3); // viernes antes de la primera semana
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diaNum = (f) => Number(f.slice(8, 10));
const fechaLarga = (f) => `${diaNum(f)} de ${MESES[Number(f.slice(5, 7)) - 1]} de ${f.slice(0, 4)}`;
// Días señalados de la historia
const D = {
  rosaSinPermiso: masDias(L2, 3), // jueves
  jorgeOlvido: masDias(L2, 3), // jueves: olvidó checar la salida (se quedó hasta las 17:40)
  jorgeLargos: [masDias(L2, 4), masDias(L1, 3), masDias(L1, 4)], // inventario
  danielaTemprano: masDias(L1, 4), // viernes
  luisRetardos: { [masDias(L3, 2)]: "14:16", [masDias(L2, 2)]: "14:22", [masDias(L1, 3)]: "14:13", [masDias(L0, 1)]: "14:18" },
  luisDuplicada: masDias(L3, 4), // viernes
  luisEvento: masDias(L1, 5), // sábado
  marianaLejos: masDias(L2, 5), // sábado
};

// Pseudoaleatorio determinista: los mismos datos en cada corrida.
let semilla = 20261125;
const azar = (a, b) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return a + (semilla % (b - a + 1)); };

const AGENTE_TEL = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const AGENTE_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const AGENTE_KIOSCO = "Mozilla/5.0 (Linux; Android 13; Lenovo TB-X606F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const AGENTE_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// ---------- Reloj de carga ----------
const FUNCIONES = ["eventos_antes_de_insertar", "acuerdos_antes_de_insertar", "firmas_antes_de_insertar", "conformidades_antes_de_insertar"];
const definicion = (f) => sql(`select pg_get_functiondef('public.${f}()'::regprocedure)`);
function instalarReloj() {
  const originales = FUNCIONES.map(definicion);
  if (originales.some((d) => d.includes("_reloj_carga"))) throw new Error("Las funciones ya están parchadas: corre de nuevo para restaurarlas primero.");
  fs.writeFileSync(ORIGINALES, originales.join(";\n\n") + ";\n");
  sql(`create table public._reloj_carga (ahora timestamptz); alter table public._reloj_carga enable row level security;
       create policy leer on public._reloj_carga for select using (true); grant select on public._reloj_carga to authenticated, anon;`);
  for (const def of originales) {
    const parche = def.replace(/clock_timestamp\(\)/g, "coalesce((select r.ahora from public._reloj_carga r limit 1), clock_timestamp())");
    if (parche === def) throw new Error("Una función ya no usa clock_timestamp(): revisa el generador.");
    sql(parche);
  }
  log("reloj de carga instalado (funciones originales en salida/funciones-originales.sql)");
}
function restaurarReloj() {
  if (fs.existsSync(ORIGINALES)) execFileSync("psql", [DB, "-XqA", "-v", "ON_ERROR_STOP=1", "-f", ORIGINALES]);
  sql("drop table if exists public._reloj_carga");
  if (FUNCIONES.some((f) => definicion(f).includes("_reloj_carga"))) throw new Error("No se pudieron restaurar las funciones: aplica salida/funciones-originales.sql a mano.");
  if (fs.existsSync(ORIGINALES)) fs.unlinkSync(ORIGINALES);
  log("funciones originales restauradas y reloj de carga eliminado");
}
const reloj = (instante) => sql(`delete from public._reloj_carga; insert into public._reloj_carga values (${lit(instante)})`);

// Ejecuta como un usuario (auth.uid()) dentro de una transacción.
const como = (uid, q) => sql(`begin; select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: uid, role: "authenticated" }))}, true); ${q}; commit;`);

// ---------- Sesiones ----------
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
async function api(page, ruta, cuerpo) {
  const r = await page.request.post(`${APP}${ruta}`, { data: cuerpo, headers: { origin: APP } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok() || j.ok === false) throw new Error(`${ruta}: ${r.status()} ${JSON.stringify(j)}`);
  return j;
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  await verificarLocal();
  // Una corrida anterior que se cortó pudo dejar las funciones parchadas.
  if (sql("select to_regclass('public._reloj_carga') is not null") === "t") restaurarReloj();
  if (sql(`select count(*) from empresas where razon_social = ${lit(EMPRESA)}`) !== "0") {
    throw new Error("La empresa de ejemplo ya existe. Para regenerarla: npx supabase db reset (borra la base local) y vuelve a correr.");
  }
  console.log(`Historia: alta el ${ALTA}; semanas del ${L3}, ${L2}, ${L1} y la actual (${L0}) hasta hoy ${HOY}.`);

  const b = await chromium.launch();
  let falso = null;
  try {
    const sesion = async (ua) => (await b.newContext({ locale: "es-MX", userAgent: ua })).newPage();
    const P = { dueno: await sesion(AGENTE_PC), rosa: await sesion(AGENTE_TEL), daniela: await sesion(AGENTE_TEL), mariana: await sesion(AGENTE_IPHONE), kiosco: await sesion(AGENTE_KIOSCO) };

    // 1. Cuentas (se crean al entrar con el código), empresa, centros, horarios y personas
    await entrar(P.dueno, C.dueno);
    const uid = (correo) => sql(`select id from auth.users where email = ${lit(correo)}`);
    const DUENO = uid(C.dueno);
    if (!DUENO) throw new Error("La cuenta del dueño no está en esta base: la app usa otra base.");
    const E = sql(`insert into empresas (razon_social, rfc, zona_horaria, recordatorios_conformidad) values (${lit(EMPRESA)}, ${lit(RFC)}, ${lit(ZONA)}, true) returning id`);
    const centro = (c, celular, kiosco) => sql(`insert into centros_trabajo (empresa_id, nombre, direccion, zona_horaria, pausa_puede_salir, ubicacion_celular, ubicacion_kiosco, latitud, longitud, radio_m)
      values ('${E}', ${lit(c.nombre)}, ${lit(c.dir)}, ${lit(ZONA)}, true, ${celular}, ${kiosco}, ${c.lat}, ${c.lon}, ${c.radio}) returning id`);
    const CM = centro(MATRIZ, true, true);
    const CN = centro(NORTE, true, false);
    sql(`insert into miembros (empresa_id, user_id, rol) values ('${E}', '${DUENO}', 'propietario')`);
    const horario = (nombre, dias, tol = 10) => sql(`insert into horarios (empresa_id, nombre, dias, tolerancia_min) values ('${E}', ${lit(nombre)}, ${lit(JSON.stringify(dias))}, ${tol}) returning id`);
    const tramos = (ds, t) => Object.fromEntries(ds.map((d) => [String(d), t]));
    const H = {
      matutino: horario("Matutino", tramos([1, 2, 3, 4, 5, 6], { entrada: "07:00", salida: "15:00", pausa_inicio: "11:00", pausa_fin: "11:30" })),
      vespertino: horario("Vespertino", tramos([1, 2, 3, 4, 5, 6], { entrada: "14:00", salida: "22:00", pausa_inicio: "18:00", pausa_fin: "18:30" })),
      medio: horario("Medio tiempo tarde", tramos([1, 2, 3, 4, 5], { entrada: "16:00", salida: "21:00" })),
      norte: horario("Plaza Norte", tramos([0, 2, 3, 4, 5, 6], { entrada: "09:00", salida: "17:00", pausa_inicio: "13:00", pausa_fin: "13:30" })),
    };
    sql(`update empresas set horario_predeterminado = '${H.matutino}' where id = '${E}'`);
    const trabajador = (t) => sql(`insert into trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, curp, fecha_ingreso, dia_descanso, dias_descanso_adicionales, telefono, telefono_verificado_en, horario_id)
      values ('${E}', '${t.centro}', ${lit(t.nombre)}, ${lit(t.numero)}, ${lit(t.email)}, ${lit(t.curp)}, ${lit(t.ingreso)}, ${t.descanso}, ${lit(`{${(t.adicionales ?? []).join(",")}}`)}, ${lit(t.tel)}, ${t.tel ? "now()" : "null"}, '${t.horario}') returning id`);
    const T = {
      rosa: { nombre: "Rosa Mendoza Ruiz", numero: "101", email: C.rosa, curp: "MERR920314MJCNZS08", ingreso: "2022-03-14", descanso: 0, centro: CM, horario: H.matutino, pin: "4821" },
      jorge: { nombre: "Jorge Castillo Vega", numero: "102", email: null, curp: "CAVJ870801HJCSGR02", ingreso: "2019-08-01", descanso: 0, centro: CM, horario: H.matutino, pin: "7350" },
      daniela: { nombre: "Daniela Ortiz Flores", numero: "103", email: C.daniela, curp: "OIFD030602MJCRLN04", ingreso: "2025-06-02", descanso: 0, adicionales: [6], centro: CM, horario: H.medio, pin: "1964", tel: "523312874456" },
      luis: { nombre: "Luis Hernández Soto", numero: "104", email: null, curp: "HESL990115HJCRTS07", ingreso: "2024-01-15", descanso: 0, centro: CM, horario: H.vespertino, pin: "2589" },
      mariana: { nombre: "Mariana Torres Gil", numero: "105", email: C.mariana, curp: "TOGM911108MJCRLR01", ingreso: "2021-11-08", descanso: 1, centro: CN, horario: H.norte, pin: "6043" },
    };
    for (const t of Object.values(T)) t.id = trabajador(t);
    for (const t of Object.values(T)) como(DUENO, `select public.asignar_pin('${t.id}', '${t.pin}')`);
    // Kiosco de la matriz y Mariana como supervisora (entran con su correo y aceptan la invitación)
    sql(`insert into invitaciones (empresa_id, email, rol, centro_trabajo_id) values ('${E}', ${lit(C.kiosco)}, 'kiosco', '${CM}'), ('${E}', ${lit(C.mariana)}, 'supervisor', null)`);
    await entrar(P.kiosco, C.kiosco, "/kiosco");
    for (const k of ["rosa", "daniela", "mariana"]) await entrar(P[k], C[k]);
    const KIOSCO = uid(C.kiosco);
    for (const k of ["rosa", "daniela", "mariana"]) T[k].uid = uid(C[k]);
    if (sql(`select count(*) from trabajadores where empresa_id = '${E}' and user_id is not null`) !== "3") throw new Error("No se vincularon las cuentas");
    if (sql(`select count(*) from miembros where empresa_id = '${E}'`) !== "3") throw new Error("No se aceptaron las invitaciones");
    log("empresa, 2 centros con ubicación, 4 horarios, 5 personas con PIN, kiosco y supervisora");

    instalarReloj();
    try {
      // 2. Acuerdos generados y firmados por la empresa el día del alta: un servidor de la app
      //    que cree que es esa fecha (el texto del acuerdo lleva la fecha de generación).
      reloj(iso(ALTA, "18:05"));
      falso = spawn("npx", ["next", "start", "-p", "3001"], {
        cwd: WEB, stdio: "ignore", detached: true,
        env: { ...process.env, FECHA_FALSA: iso(ALTA, "18:04"), NODE_OPTIONS: `--require ${path.join(AQUI, "fecha-falsa.cjs")}` },
      });
      let listo = false;
      for (let i = 0; i < 60 && !listo; i++) { listo = await fetch(`${APP_FALSA}/entrar`).then((r) => r.ok).catch(() => false); if (!listo) await new Promise((r) => setTimeout(r, 500)); }
      const fuentes = await supabaseDeLaApp(APP_FALSA);
      if (!fuentes.length || fuentes.some((f) => !esLocal(f))) throw new Error("El servidor de :3001 no usa el Supabase local.");
      await P.dueno.goto(`${APP_FALSA}/panel/trabajadores`);
      await P.dueno.getByLabel(/Revisé el texto y firmo estos acuerdos/).check();
      await P.dueno.getByRole("button", { name: /Generar y firmar 5 acuerdo/ }).click();
      await P.dueno.getByText("La empresa ya firmó el acuerdo de todo su personal.").waitFor({ timeout: 60000 });
      process.kill(-falso.pid);
      falso = null;
      const acuerdo = (t) => sql(`select id from acuerdos where trabajador_id = '${t.id}' and version = 1`);
      if (!sql(`select contenido from acuerdos where trabajador_id = '${T.rosa.id}'`).includes(fechaLarga(ALTA))) throw new Error("El acuerdo no tiene la fecha del alta");
      // Firmas: app (Rosa, Mariana, Daniela), kiosco con PIN (Jorge) y papel (Luis)
      reloj(iso(ALTA, "20:41")); await api(P.rosa, "/api/acuerdos/firmar", { acuerdoId: acuerdo(T.rosa), acepto: true });
      reloj(iso(masDias(ALTA, 1), "09:12")); await api(P.mariana, "/api/acuerdos/firmar", { acuerdoId: acuerdo(T.mariana), acepto: true });
      reloj(iso(masDias(ALTA, 1), "16:20")); await api(P.daniela, "/api/acuerdos/firmar", { acuerdoId: acuerdo(T.daniela), acepto: true });
      reloj(iso(L3, "06:49")); await api(P.kiosco, "/api/kiosco/firmar-acuerdo", { numero: T.jorge.numero, pin: T.jorge.pin, acuerdoId: acuerdo(T.jorge), acepto: true });
      reloj(iso(L3, "12:30"));
      como(DUENO, `insert into firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad, evidencia) values ('${E}', '${acuerdo(T.luis)}', 'trabajador', 'autografa',
        ${lit(JSON.stringify({ ip: "189.203.44.17", agente: AGENTE_PC, resguardo: "Expediente de personal, archivero de la oficina", fecha_firma: masDias(ALTA, 1) }))})`);
      log(`acuerdos del ${fechaLarga(ALTA)} firmados por la empresa y por las 5 personas (app, kiosco y papel)`);

      // 3. Línea de tiempo: checadas, ubicaciones, correcciones y conformidades
      const acciones = [];
      const en = (instante, hacer) => acciones.push({ t: Date.parse(instante), hacer });
      const evento = (t, tipo, origen, fecha, hhmm, extra = {}) => en(iso(fecha, hhmm), async () => {
        const ev = origen === "whatsapp"
          ? { medio: azar(0, 3) ? "boton" : "texto", wamid: `wamid.${crypto.randomUUID()}`, telefono: t.tel, enviado_en: iso(fecha, hhmm) }
          : { ip: origen === "kiosco" ? "187.190.33.201" : `201.141.${azar(2, 250)}.${azar(2, 250)}`, agente: origen === "kiosco" ? AGENTE_KIOSCO : t === T.mariana ? AGENTE_IPHONE : AGENTE_TEL };
        const ins = `insert into eventos (empresa_id, trabajador_id, tipo, origen, id_cliente, evidencia${tipo === "inicio_pausa" ? ", puede_salir" : ""})
          values ('${E}', '${t.id}', '${tipo}', '${origen}', gen_random_uuid(), ${lit(JSON.stringify(ev))}${tipo === "inicio_pausa" ? ", true" : ""}) returning id`;
        // Kiosco: la cuenta del kiosco; celular: la persona; WhatsApp: sin sesión (como el webhook).
        const quien = origen === "kiosco" ? KIOSCO : origen === "pwa" ? t.uid : null;
        const id = (quien ? como(quien, ins) : sql(ins)).split("\n").find((l) => /^\d+$/.test(l));
        // Ubicación (fuera de la bitácora), solo donde el centro la registra
        if (origen !== "pwa" && origen !== "kiosco") return;
        const c = t.centro === CN ? NORTE : MATRIZ;
        if (extra.sinPermiso) {
          sql(`insert into ubicaciones_evento (evento_id, empresa_id, trabajador_id, centro_trabajo_id, dispositivo, estado, creada_en)
               values (${id}, '${E}', '${t.id}', '${t.centro}', 'celular', 'denegada', ${lit(iso(fecha, hhmm))})`);
          return;
        }
        const d = extra.lejos || azar(4, origen === "kiosco" ? 12 : 45);
        const ang = (azar(0, 359) * Math.PI) / 180;
        const lat = c.lat + (d * Math.cos(ang)) / 111320, lon = c.lon + (d * Math.sin(ang)) / (111320 * Math.cos((c.lat * Math.PI) / 180));
        sql(`insert into ubicaciones_evento (evento_id, empresa_id, trabajador_id, centro_trabajo_id, dispositivo, estado, latitud, longitud, precision_m, distancia_m, dentro, capturada_en, creada_en)
             values (${id}, '${E}', '${t.id}', '${t.centro}', '${origen === "kiosco" ? "kiosco" : "celular"}', 'ok', ${lat.toFixed(4)}, ${lon.toFixed(4)},
                     ${origen === "kiosco" ? azar(8, 20) : azar(9, 35)}, ${Math.round(d)}, ${Math.round(d) <= c.radio}, ${lit(iso(fecha, hhmm))}, ${lit(iso(fecha, hhmm))})`);
      });
      const jornada = (t, origen, fecha, ent, pausa, sal, extra = {}) => {
        evento(t, "entrada", origen, fecha, ent, extra);
        if (pausa) { evento(t, "inicio_pausa", origen, fecha, pausa[0]); evento(t, "fin_pausa", origen, fecha, pausa[1]); }
        if (sal) evento(t, "salida", origen, fecha, sal);
      };
      for (let f = L3; f <= HOY; f = masDias(f, 1)) {
        const d = dow(f);
        if (d >= 1 && d <= 6) { // Rosa: matutino, celular, muy puntual
          const p = sumarMin("11:00", azar(-2, 4));
          jornada(T.rosa, "pwa", f, sumarMin("06:50", azar(0, 9)), [p, sumarMin(p, azar(29, 32))], sumarMin("15:00", azar(0, 7)),
            f === D.rosaSinPermiso ? { sinPermiso: true } : {});
        }
        if (d >= 1 && d <= 6) { // Jorge: matutino, kiosco; algunos días se queda a inventario
          const p = sumarMin("11:30", azar(-3, 5));
          jornada(T.jorge, "kiosco", f, sumarMin("06:49", azar(0, 9)), [p, sumarMin(p, azar(29, 33))],
            f === D.jorgeOlvido ? null : D.jorgeLargos.includes(f) ? sumarMin("17:30", azar(0, 25)) : sumarMin("15:01", azar(0, 9)));
        }
        if (d >= 1 && d <= 5) { // Daniela: medio tiempo por WhatsApp
          evento(T.daniela, "entrada", "whatsapp", f, sumarMin("15:54", azar(0, 9)));
          evento(T.daniela, "salida", "whatsapp", f, f === D.danielaTemprano ? "19:32" : sumarMin("21:00", azar(0, 6)));
        }
        if (d >= 1 && d <= 6) { // Luis: vespertino, kiosco, algunos retardos
          const ent = D.luisRetardos[f] ?? sumarMin("13:53", azar(0, 9));
          evento(T.luis, "entrada", "kiosco", f, ent);
          if (f === D.luisDuplicada) evento(T.luis, "entrada", "kiosco", f, sumarMin(ent, 1));
          const p = sumarMin("18:00", azar(-2, 6));
          evento(T.luis, "inicio_pausa", "kiosco", f, p);
          evento(T.luis, "fin_pausa", "kiosco", f, sumarMin(p, azar(29, 33)));
          evento(T.luis, "salida", "kiosco", f, sumarMin("22:00", azar(0, 11)));
        }
        if (d !== 1) { // Mariana: Plaza Norte, celular, martes a domingo
          const p = sumarMin("13:00", azar(-3, 6));
          jornada(T.mariana, "pwa", f, sumarMin("08:48", azar(0, 9)), [p, sumarMin(p, azar(29, 34))], sumarMin("17:02", azar(0, 15)),
            f === D.marianaLejos ? { lejos: 520 } : {});
        }
      }

      // Correcciones del panel (con motivo; nada se borra)
      en(iso(D.luisDuplicada, "22:40"), async () => como(DUENO, `insert into eventos (empresa_id, trabajador_id, tipo, origen, corrige_evento_id, motivo)
        values ('${E}', '${T.luis.id}', 'anulacion', 'panel', ${sql(`select max(id) from eventos where trabajador_id = '${T.luis.id}' and tipo = 'entrada' and (hora_efectiva at time zone '${ZONA}')::date = '${D.luisDuplicada}'`)},
        'Checada duplicada en el kiosco (dos toques seguidos)')`));
      en(iso(masDias(D.jorgeOlvido, 1), "08:15"), async () => como(DUENO, `insert into eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
        values ('${E}', '${T.jorge.id}', 'salida', 'panel', 'Olvidó checar su salida; se registra la hora de fin de su turno', ${lit(iso(D.jorgeOlvido, "15:00"))})`));

      // Conformidades: app (/api/conformidades) o kiosco (/api/kiosco/conformidad)
      const enApp = (k, lunes, respuesta, comentario) => api(P[k], "/api/conformidades", { trabajadorId: T[k].id, semana: lunes, respuesta, comentario });
      const enKiosco = (k, lunes, respuesta, comentario) => api(P.kiosco, "/api/kiosco/conformidad", { numero: T[k].numero, pin: T[k].pin, lunes, respuesta, comentario });
      // Primera semana: todos conformes
      en(iso(L2, "07:31"), () => enApp("rosa", L3, "conforme"));
      en(iso(L2, "06:59"), () => enKiosco("jorge", L3, "conforme"));
      en(iso(L2, "16:08"), () => enApp("daniela", L3, "conforme"));
      en(iso(L2, "13:56"), () => enKiosco("luis", L3, "conforme"));
      en(iso(masDias(L2, 1), "09:14"), () => enApp("mariana", L3, "conforme"));
      // Segunda semana: Jorge objeta la salida capturada; la empresa corrige y él confirma
      en(iso(L1, "06:58"), () => enApp("rosa", L2, "conforme"));
      en(iso(masDias(L1, 1), "07:04"), () => enKiosco("jorge", L2, "objeta",
        `El jueves ${diaNum(D.jorgeOlvido)} salí a las 17:40, no a las 15:00. Me quedé a recibir el pedido de café del proveedor.`));
      en(iso(masDias(L1, 1), "10:22"), async () => como(DUENO, `insert into eventos (empresa_id, trabajador_id, tipo, origen, corrige_evento_id, motivo, hora_efectiva)
        values ('${E}', '${T.jorge.id}', 'correccion', 'panel', ${sql(`select id from eventos where trabajador_id = '${T.jorge.id}' and origen = 'panel' and tipo = 'salida'`)},
        'Objeción de Jorge: se quedó a recibir el pedido del proveedor (lo confirma la nota de entrega de las 17:35)', ${lit(iso(D.jorgeOlvido, "17:40"))})`));
      en(iso(masDias(L1, 2), "07:01"), () => enKiosco("jorge", L2, "conforme"));
      en(iso(masDias(L1, 1), "16:03"), () => enApp("daniela", L2, "conforme"));
      en(iso(masDias(L1, 1), "14:02"), () => enKiosco("luis", L2, "conforme"));
      en(iso(masDias(L1, 1), "08:57"), () => enApp("mariana", L2, "conforme"));
      // Semana pasada: Luis objeta (queda pendiente) y Daniela aún no responde
      en(iso(L0, "07:02"), () => enApp("rosa", L1, "conforme"));
      en(iso(masDias(L0, 1), "06:58"), () => enKiosco("jorge", L1, "conforme"));
      en(iso(L0, "14:08"), () => enKiosco("luis", L1, "objeta",
        `El sábado ${diaNum(D.luisEvento)} entré a las 12:00 para ayudar con el evento privado y el kiosco no tomó mi entrada; aparece hasta las 14:00.`));
      en(iso(masDias(L0, 1), "09:06"), () => enApp("mariana", L1, "conforme"));

      // Solo lo que ya pasó (lo de hoy, hasta hace 3 minutos), en orden cronológico
      const limite = Date.now() - 3 * 60000;
      acciones.sort((a, z) => a.t - z.t);
      let n = 0;
      for (const a of acciones) {
        if (a.t > limite) continue;
        reloj(new Date(a.t).toISOString());
        await a.hacer();
        n++;
      }
      log(`${n} acciones en orden cronológico (del ${L3} a hoy)`);
    } finally {
      restaurarReloj();
    }

    const rota = sql(`select public.verificar_cadena('${E}')`);
    if (rota) throw new Error(`La cadena de la bitácora está rota en el registro ${rota}`);
    log(`cadena de la bitácora íntegra (${sql(`select count(*) from eventos where empresa_id = '${E}'`)} registros)`);
    fs.writeFileSync(path.join(SALIDA, "ids.json"), JSON.stringify({
      empresa: E, semanas: { L3, L2, L1, L0 }, correos: C,
      trabajadores: Object.fromEntries(Object.entries(T).map(([k, t]) => [k, { id: t.id, numero: t.numero, pin: t.pin }])),
    }, null, 2));
    log("listo: node scripts/ejemplo/capturar.cjs toma las capturas");
  } finally {
    if (falso) try { process.kill(-falso.pid); } catch {}
    await b.close();
  }
})().catch((e) => {
  console.error("FALLÓ:", e.message);
  if (verificado) try { if (sql("select to_regclass('public._reloj_carga') is not null") === "t") restaurarReloj(); } catch {}
  process.exit(1);
});
