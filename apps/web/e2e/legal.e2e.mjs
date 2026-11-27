// Prueba de punta a punta de los términos y avisos de privacidad (docs/legal/README.md):
// páginas /terminos y /privacidad, aceptación al crear la empresa, aviso en el panel para quien
// no los ha aceptado, y el enlace al aviso de privacidad de la empresa para su personal.
// Requisitos: Supabase local y la app corriendo con LEGAL_PUBLICADO=1 (como si ya estuvieran
// revisados). Uso: node apps/web/e2e/legal.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36);
const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const version = (n) => /Versión\s+([0-9.]+)/.exec(readFileSync(new URL(`../content/legal/${n}.md`, import.meta.url), "utf8"))[1];
const V = { terminos: version("terminos"), privacidad: version("privacidad") };

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

const browser = await chromium.launch();
const nueva = () => browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-MX" }).then((c) => c.newPage());
try {
  // 1. Páginas públicas, sin sesión
  const anonimo = await nueva();
  for (const [ruta, n, titulo] of [["/terminos", "terminos", "Términos y Condiciones"], ["/privacidad", "privacidad", "Aviso de privacidad"]]) {
    await anonimo.goto(`${APP}${ruta}`);
    await anonimo.getByRole("heading", { level: 1, name: new RegExp(titulo) }).waitFor();
    await anonimo.getByText(`Versión ${V[n]}`).waitFor();
    if (await anonimo.getByText(/Notas para el abogado|BORRADOR para revisión/).count()) throw new Error(`${ruta} publica las notas internas`);
  }
  paso(`/terminos (v${V.terminos}) y /privacidad (v${V.privacidad}) se ven sin sesión y sin las notas internas`);

  // 2. Alta de empresa: la aceptación queda registrada
  const dueno = await nueva();
  const DUENO = `dueno.legal.${sufijo}@ejemplo.mx`;
  const EMPRESA = `Papelería Legal ${sufijo}`;
  await entrar(dueno, DUENO, "/alta-empresa");
  await dueno.waitForURL(`${APP}/alta-empresa`);
  await dueno.getByLabel("Razón social o nombre del negocio").fill(EMPRESA);
  await dueno.getByLabel("Sí, puede salir").check();
  if (!(await dueno.locator("input[name=acepto]").evaluate((e) => e.required))) throw new Error("La aceptación debía ser obligatoria");
  await dueno.locator("input[name=acepto]").check();
  await dueno.getByRole("button", { name: "Crear empresa" }).click();
  await dueno.waitForURL(`${APP}/panel`);
  const fila = sql(`select a.terminos_version || '|' || a.privacidad_version || '|' || (a.evidencia ? 'agente') || '|' || (u.email = '${DUENO}')
    from aceptaciones_legales a join empresas e on e.id = a.empresa_id join auth.users u on u.id = a.user_id where e.razon_social = '${EMPRESA}'`);
  if (fila !== `${V.terminos}|${V.privacidad}|true|true`) throw new Error(`Aceptación mal registrada: ${fila}`);
  if (await dueno.locator(".aviso-legal").count()) throw new Error("Quien ya aceptó no debía ver el aviso");
  paso("al crear la empresa se registra la aceptación (versiones, cuenta y navegador) y el panel no la vuelve a pedir");

  // 3. Empresa sin aceptación (anterior a la publicación): el panel la pide
  const otro = await nueva();
  const OTRO = `dueno.legal2.${sufijo}@ejemplo.mx`;
  await entrar(otro, OTRO, "/alta-empresa");
  const uid = sql(`select id from auth.users where email = '${OTRO}'`);
  sql(`begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); select public.crear_empresa('Taller Sin Aceptar ${sufijo}'); commit;`);
  await otro.goto(`${APP}/panel`);
  await otro.locator(".aviso-legal").getByText("Revisa y acepta los términos de Checador").waitFor();
  await otro.locator(".aviso-legal").getByRole("button", { name: "Acepto" }).click();
  // Al aceptar, el panel se actualiza y el aviso desaparece.
  await otro.locator(".aviso-legal").waitFor({ state: "detached" });
  if (sql(`select count(*) from aceptaciones_legales a join empresas e on e.id = a.empresa_id where e.razon_social = 'Taller Sin Aceptar ${sufijo}' and a.terminos_version = '${V.terminos}'`) !== "1") {
    throw new Error("No se registró la aceptación desde el panel");
  }
  await otro.reload();
  if (await otro.locator(".aviso-legal").count()) throw new Error("Tras aceptar, el aviso debía desaparecer");
  paso("una empresa sin aceptación ve el aviso en el panel; al aceptar se registra y desaparece");

  // 4. Aviso de privacidad de la empresa para su personal
  await dueno.goto(`${APP}/panel/configuracion`);
  await dueno.getByLabel(/Enlace a tu aviso de privacidad/).fill("http://inseguro.mx/aviso");
  await dueno.getByRole("button", { name: "Guardar datos" }).click();
  await dueno.getByRole("status").filter({ hasText: "debe empezar con https://" }).waitFor();
  await dueno.getByLabel(/Enlace a tu aviso de privacidad/).fill("https://papeleria.mx/aviso-de-privacidad");
  await dueno.getByRole("button", { name: "Guardar datos" }).click();
  await dueno.getByRole("status").filter({ hasText: "Datos de la empresa actualizados." }).waitFor();
  const TRAB = `trab.legal.${sufijo}@ejemplo.mx`;
  sql(`insert into trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
       select e.id, c.id, 'Lola Legal', '501', '${TRAB}', '2026-01-10' from empresas e join centros_trabajo c on c.empresa_id = e.id where e.razon_social = '${EMPRESA}'`);
  const trab = await nueva();
  await entrar(trab, TRAB, "/");
  const enlace = trab.getByRole("link", { name: `Aviso de privacidad de ${EMPRESA}` });
  await enlace.waitFor();
  if ((await enlace.getAttribute("href")) !== "https://papeleria.mx/aviso-de-privacidad") throw new Error("Enlace incorrecto");
  paso("el enlace al aviso de la empresa solo acepta https y la persona trabajadora lo ve en la app");

  console.log("\nPrueba de términos y avisos: OK");
} catch (e) {
  console.error("\nFALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
