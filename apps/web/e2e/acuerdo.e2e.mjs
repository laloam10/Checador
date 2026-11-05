// Prueba de punta a punta del acuerdo con firma (art. 132 XXXIV) contra Supabase local.
// Requiere semilla.sql y semilla-kiosco.sql. Es repetible: en cada corrida cambia el día de
// descanso de Ana y Beto para obligar a generar una nueva versión del acuerdo.
// Uso: node apps/web/e2e/acuerdo.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const EMPRESA = "aaaaaaaa-0000-0000-0000-000000000001";
const ANA = "aaaaaaaa-0000-0000-0000-000000000003";
const BETO = "aaaaaaaa-0000-0000-0000-000000000004";
const DUENO = "dueno.espiga@ejemplo.mx";
const KIOSCO = "kiosco.centro@ejemplo.mx";

const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const estado = (p, texto) => p.getByRole("status").filter({ hasText: texto }).first().waitFor();

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
    if (!codigo) await new Promise((r) => setTimeout(r, 500));
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
}
const miembro = (correo, rol, extra = "") =>
  sql(`insert into miembros (empresa_id, user_id, rol${extra ? ", centro_trabajo_id" : ""})
       select '${EMPRESA}', id, '${rol}'${extra ? `, '${extra}'` : ""} from auth.users where email = '${correo}'
       on conflict do nothing`);

async function generarYFirmar(dueno, trabajadorId, nombre) {
  await dueno.goto(`${APP}/panel/trabajadores/${trabajadorId}`);
  await dueno.getByRole("heading", { name: "Acuerdo de registro electrónico" }).waitFor();
  const resumen = dueno.getByText(/Revisar y firmar la versión \d+/);
  if (!(await dueno.locator("details[open]").filter({ has: resumen }).count())) await resumen.click();
  await dueno.locator("pre.texto-acuerdo").filter({ hasText: nombre }).waitFor();
  const boton = dueno.getByRole("button", { name: /Firmar versión \d+ como empresa/ });
  await boton.click();
  await estado(dueno, "Confirma que revisaste el texto");
  await dueno.getByLabel(/Revisé el texto y lo firmo/).check();
  await boton.click();
  // Al firmar, el formulario desaparece (ya no hay nada que proponer): se confirma con el estado pendiente.
  await dueno.getByText(/pendiente de firma de la persona trabajadora/).waitFor();
}

const browser = await chromium.launch();
const nueva = async (w, h) => (await browser.newContext({ viewport: { width: w, height: h }, locale: "es-MX" })).newPage();
const dueno = await nueva(1100, 1000);
const ana = await nueva(390, 844);
const kiosco = await nueva(800, 1280);
for (const p of [dueno, ana, kiosco]) p.on("pageerror", (e) => console.error("Error en la página:", e.message));

try {
  sql(`update trabajadores set dia_descanso = (dia_descanso + 1) % 7 where id in ('${ANA}', '${BETO}')`);

  // 1. Empleador
  await entrar(dueno, DUENO, "/panel");
  if (dueno.url().includes("/alta-empresa")) {
    miembro(DUENO, "propietario");
    await dueno.goto(`${APP}/panel`);
  }
  await generarYFirmar(dueno, ANA, "Ana Pérez");
  paso("el empleador revisó el texto y firmó; sin confirmar no se puede firmar");

  // 2. Ana firma en su app
  await entrar(ana, "ana@ejemplo.mx", "/");
  await ana.getByRole("link", { name: /Tu empleador te envió el acuerdo/ }).click();
  await ana.locator("pre.texto-acuerdo").filter({ hasText: "ACUERDO PARA EL REGISTRO ELECTRÓNICO" }).waitFor();
  const firmar = ana.getByRole("button", { name: "Firmar acuerdo" });
  if (!(await firmar.isDisabled())) throw new Error("El botón de firma debería estar deshabilitado sin confirmar la lectura");
  await ana.getByLabel(/Leí el acuerdo completo/).check();
  await firmar.click();
  await ana.getByText(/Acuerdo vigente: versión \d+/).waitFor();
  paso("Ana recibió el aviso en su app, leyó el acuerdo y lo firmó");

  await dueno.reload();
  await dueno.getByText(/Vigente: versión \d+/).waitFor();
  await dueno.getByText(/Persona trabajadora: firma electrónica/).waitFor();
  if (await dueno.getByText(/Revisar y firmar la versión/).count()) throw new Error("No debería proponerse una nueva versión");
  paso("el panel muestra el acuerdo vigente con ambas firmas y no propone otra versión");

  // 3. Beto (sin celular) firma en el kiosco
  await generarYFirmar(dueno, BETO, "Beto López");
  await entrar(kiosco, KIOSCO, "/kiosco");
  miembro(KIOSCO, "kiosco");
  await kiosco.goto(`${APP}/kiosco`);
  for (const valor of ["002", "2580"]) {
    await kiosco.getByRole("button", { name: "Continuar" }).waitFor();
    for (const d of valor) await kiosco.getByRole("button", { name: d, exact: true }).click();
    await kiosco.getByRole("button", { name: "Continuar" }).click();
  }
  await kiosco.getByRole("button", { name: "Tienes un acuerdo por firmar" }).click();
  await kiosco.locator("pre.texto-acuerdo").filter({ hasText: "Beto López" }).waitFor();
  await kiosco.getByRole("button", { name: "Leí el acuerdo y lo firmo con mi PIN" }).click();
  await kiosco.getByText("Acuerdo firmado").waitFor();
  paso("Beto leyó y firmó su acuerdo en el kiosco con su PIN");

  await dueno.reload();
  await dueno.getByText(/Persona trabajadora: PIN en el kiosco/).waitFor();
  await dueno.getByRole("link", { name: "ver / imprimir" }).first().click();
  await dueno.getByText(/Folio [0-9a-f]{12}/).waitFor();
  await dueno.getByText(/Huella digital \(SHA-256\) del texto: [0-9a-f]{64}/).waitFor();
  await dueno.getByText(`Firmó: ${DUENO}`).waitFor();
  paso("la vista para imprimir muestra folio, huella SHA-256, quién firmó por la empresa y la modalidad de cada firma");

  // 4. En la base
  const ver = (id) => sql(`select f.modalidad || ',' || (f.contenido_hash = a.contenido_hash) || ',' || (f.evidencia ? 'agente')
    from acuerdos a join firmas_acuerdo f on f.acuerdo_id = a.id and f.firmante = 'trabajador'
    where a.trabajador_id = '${id}' order by a.version desc limit 1`);
  if (ver(ANA) !== "electronica,true,true") throw new Error(`Firma de Ana inesperada: ${ver(ANA)}`);
  if (ver(BETO) !== "pin_kiosco,true,true") throw new Error(`Firma de Beto inesperada: ${ver(BETO)}`);
  paso("en la base: cada firma está ligada al hash del texto firmado y tiene evidencia del servidor");

  console.log("\nPrueba del acuerdo: OK");
} catch (e) {
  for (const [n, p] of [["dueno", dueno], ["ana", ana], ["kiosco", kiosco]]) await p.screenshot({ path: `e2e-fallo-${n}.png`, fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(capturas en e2e-fallo-*.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
