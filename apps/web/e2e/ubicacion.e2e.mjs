// Prueba de la ubicación al checar (opcional, por centro de trabajo). La ubicación de cada
// navegador la simula Playwright; todo lo demás es real (panel, app, kiosco, API y base).
// Requisitos: app y Supabase local, psql, semilla-kiosco.sql cargada.
// Con GOOGLE_MAPS_EMBED_KEY (la misma con que corre la app) prueba la ventana de mapa; sin ella,
// el enlace a Google Maps. Nunca sale a Google: la prueba responde por él.
// Uso: [GOOGLE_MAPS_EMBED_KEY=<la misma>] node apps/web/e2e/ubicacion.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36);
const DUENO = `dueno.${sufijo}@ubicacion.mx`;
const ANA = `ana.${sufijo}@ubicacion.mx`;
const LEO = `leo.${sufijo}@ubicacion.mx`;
const KIOSCO = "kiosco.centro@ejemplo.mx";
const EMPRESA_K = "aaaaaaaa-0000-0000-0000-000000000001";
const CENTRO_K = "aaaaaaaa-0000-0000-0000-000000000002";
const CENTRO = { latitude: 19.4326, longitude: -99.1332 };
const LEJOS = { latitude: 19.5, longitude: -99.1332 }; // ~7.5 km al norte
const LLAVE = process.env.GOOGLE_MAPS_EMBED_KEY ?? "";
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
const ubicacionDe = (correo) => sql(`select u.estado || '|' || coalesce(u.dentro::text, '') || '|' || coalesce(u.distancia_m::text, '') || '|' || u.dispositivo
  from ubicaciones_evento u join trabajadores t on t.id = u.trabajador_id where t.email = '${correo}' order by u.creada_en desc limit 1`);

const browser = await chromium.launch();
const contextos = [];
const bloqueos = [];
const nuevo = async (opciones) => {
  const c = await browser.newContext({ locale: "es-MX", viewport: { width: 1180, height: 860 }, ...opciones });
  contextos.push(c);
  // Google no se contacta en la prueba: se responde con una página vacía.
  await c.route("https://www.google.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<p>mapa simulado</p>" }));
  const p = await c.newPage();
  p.on("pageerror", (e) => console.error("Error en la página:", e.message));
  p.on("console", (m) => /Content Security Policy|Refused to frame/i.test(m.text()) && bloqueos.push(m.text()));
  return p;
};
let pagina;
try {
  // 1. La dueña activa la ubicación del centro desde el panel, estando en el lugar.
  const d = (pagina = await nuevo({ geolocation: CENTRO, permissions: ["geolocation"] }));
  await entrar(d, DUENO, "/panel");
  await d.waitForURL(`${APP}/alta-empresa`);
  await d.getByLabel("Razón social o nombre del negocio").fill(`Panadería La Ubicación ${sufijo}`);
  await d.getByLabel("Sí, puede salir").check();
  await d.getByRole("button", { name: "Crear empresa" }).click();
  await d.waitForURL(`${APP}/panel`);
  await d.goto(`${APP}/panel/centros`);
  const f = d.locator("section.centro").first();
  await f.getByLabel("En los celulares de las personas de este centro").check();
  await f.getByRole("button", { name: "Guardar" }).click();
  await f.getByText(/captura las coordenadas del centro/).waitFor();
  paso("sin coordenadas del centro no se puede activar");
  await f.getByRole("button", { name: "Usar mi ubicación actual" }).click();
  await f.getByText(/Listo \(precisión/).waitFor();
  if ((await f.getByLabel("Latitud").inputValue()) !== "19.43260") throw new Error("No se llenó la latitud del centro");
  await f.getByRole("button", { name: "Guardar" }).click();
  await d.getByText(/deben firmar una versión nueva del acuerdo/).waitFor();
  await d.getByText(/Ubicación: celular · radio 150 m/).waitFor();
  paso("la dueña toma las coordenadas del centro con su ubicación y activa la ubicación en celulares");

  const [empresa, centro] = sql(`select e.id || '|' || c.id from empresas e join centros_trabajo c on c.empresa_id = e.id
    where e.razon_social = 'Panadería La Ubicación ${sufijo}'`).split("|");
  sql(`insert into trabajadores (empresa_id, centro_trabajo_id, nombre, email, numero_empleado, fecha_ingreso, dia_descanso) values
    ('${empresa}', '${centro}', 'Ana Lejos Ruiz', '${ANA}', '201', '2026-01-05', 0),
    ('${empresa}', '${centro}', 'Leo Sinpermiso Paz', '${LEO}', '202', '2026-01-05', 0)`);

  // 2. Ana checa lejos del centro: se registra igual, con la ubicación "fuera del centro".
  const a = (pagina = await nuevo({ geolocation: LEJOS, permissions: ["geolocation"], viewport: { width: 390, height: 844 } }));
  await entrar(a, ANA, "/");
  await a.waitForURL(`${APP}/`);
  await a.getByText("Tu empresa registra la ubicación de tu teléfono solo al momento de checar.").waitFor();
  await a.getByRole("button", { name: "Registrar entrada" }).click();
  await a.getByText("Entrada registrada.").waitFor();
  const [estadoA, dentroA, distA] = ubicacionDe(ANA).split("|");
  if (estadoA !== "ok" || dentroA !== "false" || !(Number(distA) > 7000 && Number(distA) < 8000)) throw new Error(`Ubicación de Ana: ${ubicacionDe(ANA)}`);
  paso("lejos del centro la checada se registra, con su ubicación fuera del radio (≈7.5 km)");

  // 3. Leo no da permiso: la checada se registra igual.
  const l = (pagina = await nuevo({ viewport: { width: 390, height: 844 } }));
  await entrar(l, LEO, "/");
  await l.waitForURL(`${APP}/`);
  await l.getByRole("button", { name: "Registrar entrada" }).click();
  await l.getByText("Entrada registrada.").waitFor();
  const estadoL = ubicacionDe(LEO).split("|")[0];
  if (estadoL === "ok" || !estadoL) throw new Error(`Ubicación de Leo: ${ubicacionDe(LEO)}`);
  paso(`sin permiso de ubicación la checada se registra igual (queda "${estadoL}")`);

  // 4. La dueña lo ve en la bitácora de cada persona.
  pagina = d;
  const idAna = sql(`select id from trabajadores where email = '${ANA}'`);
  const idLeo = sql(`select id from trabajadores where email = '${LEO}'`);
  await d.goto(`${APP}/panel/trabajadores/${idAna}/semana`);
  await d.getByText(/fuera del centro · a 7\.\d km/).waitFor();
  if (LLAVE) {
    await d.getByRole("button", { name: "ver en mapa" }).click();
    const marco = d.locator("dialog.ventana-mapa iframe");
    await marco.waitFor();
    const src = await marco.getAttribute("src");
    if (!src?.startsWith(`https://www.google.com/maps/embed/v1/place?key=${LLAVE}&q=19.5%2C-99.1332`)) throw new Error(`Mapa: ${src}`);
    await d.frameLocator("dialog.ventana-mapa iframe").getByText("mapa simulado").waitFor();
    if (bloqueos.length) throw new Error(`La CSP bloqueó el mapa: ${bloqueos[0]}`);
    if (process.env.CAPTURAS) await d.screenshot({ path: `${process.env.CAPTURAS}/ventana-mapa.png` });
    await d.getByRole("button", { name: "Cerrar" }).click();
    await marco.waitFor({ state: "detached", timeout: 5000 }).catch(() => {
      throw new Error("Al cerrar la ventana el mapa debía desaparecer");
    });
    paso("ver en mapa abre Google Maps en una ventana dentro de Checador (la CSP lo permite)");
  } else {
    const href = await d.getByRole("link", { name: "ver en mapa" }).getAttribute("href");
    if (href !== "https://www.google.com/maps/search/?api=1&query=19.5%2C-99.1332") throw new Error(`Enlace: ${href}`);
    paso("sin llave, ver en mapa abre Google Maps en otra pestaña");
  }
  await d.goto(`${APP}/panel/trabajadores/${idLeo}/semana`);
  await d.getByText(/sin permiso de ubicación|ubicación no disponible/).waitFor();
  paso("en la bitácora del panel: fuera del centro con la distancia, y sin permiso");

  // La persona ve su propia ubicación en Mis registros.
  pagina = a;
  await a.goto(`${APP}/registros`);
  await a.getByRole("heading", { name: "Ubicación de tus checadas" }).waitFor();
  await a.getByText(/fuera del centro · a 7\.\d km/).waitFor();
  await a.getByText("ver en mapa").waitFor();
  pagina = l;
  await l.goto(`${APP}/registros`);
  await l.getByText(/sin permiso de ubicación|ubicación no disponible/).waitFor();
  if (process.env.CAPTURAS) await a.screenshot({ path: `${process.env.CAPTURAS}/registros-ubicacion.png`, fullPage: true });
  paso("cada persona ve su propia ubicación en Mis registros");

  // 5. Kiosco con la ubicación activada en su centro.
  sql(`update centros_trabajo set latitud = 19.4326, longitud = -99.1332, ubicacion_kiosco = true where id = '${CENTRO_K}'`);
  // Persona propia (no la de la semilla) para no cambiar el estado que esperan otras pruebas.
  const NUMERO = `7${Date.now() % 100000}`.slice(0, 6);
  const idK = sql(`insert into trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, dia_descanso)
    values ('${EMPRESA_K}', '${CENTRO_K}', 'Kiosco Ubicación ${sufijo}', '${NUMERO}', '2026-01-05', 0) returning id`).split("\n")[0];
  sql(`select public.asignar_pin('${idK}', '3917')`);
  sql(`insert into miembros (empresa_id, user_id, rol, centro_trabajo_id)
       select '${EMPRESA_K}', id, 'kiosco', '${CENTRO_K}' from auth.users where email = '${KIOSCO}' on conflict do nothing`);
  const k = (pagina = await nuevo({ geolocation: CENTRO, permissions: ["geolocation"], viewport: { width: 800, height: 1280 } }));
  await entrar(k, KIOSCO, "/kiosco");
  await k.waitForURL(`${APP}/kiosco`);
  await k.getByText("Este kiosco registra su ubicación al checar.").waitFor();
  const teclear = async (t) => {
    for (const c of t) await k.getByRole("button", { name: c, exact: true }).click();
    await k.getByRole("button", { name: "Continuar" }).click();
  };
  await k.getByRole("heading", { name: "Número de empleado" }).waitFor();
  await teclear(NUMERO);
  await k.getByRole("heading", { name: "PIN" }).waitFor();
  await teclear("3917");
  await k.getByRole("button", { name: "Registrar entrada" }).click();
  await k.getByText(/registrada/).waitFor();
  const kiosco = sql(`select u.estado || '|' || u.dentro || '|' || u.dispositivo from ubicaciones_evento u join eventos e on e.id = u.evento_id
    where e.trabajador_id = '${idK}' and e.origen = 'kiosco' order by e.id desc limit 1`);
  if (kiosco !== "ok|true|kiosco") throw new Error(`Ubicación del kiosco: ${kiosco}`);
  paso("el kiosco registra su ubicación, dentro de su centro");

  console.log("\nPrueba de ubicación: OK");
} catch (e) {
  await pagina?.screenshot({ path: "e2e-fallo.png" }).catch(() => {});
  console.error("FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  sql(`update centros_trabajo set ubicacion_kiosco = false where id = '${CENTRO_K}'`);
  for (const c of contextos) await c.close();
  await browser.close();
}
