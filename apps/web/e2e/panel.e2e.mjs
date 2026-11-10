// Prueba de punta a punta del panel del empleador contra Supabase local.
// Recorre: alta de empresa → centro → trabajador con PIN → invitación de kiosco →
// el kiosco checa → tablero → corrección, checada faltante y anulación → integridad → accesos → baja.
// Uso: node apps/web/e2e/panel.e2e.mjs   (requiere app y Supabase local, como pwa.e2e.mjs)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36); // permite repetir la prueba sin chocar con datos anteriores
const DUENO = `dueno.${sufijo}@trigo.mx`;
const KIOSCO = `kiosco.${sufijo}@trigo.mx`;
const EMPRESA = `Panadería El Trigo ${sufijo}`;
const NUMERO = String(Date.now()).slice(-6); // el teclado del kiosco es numérico
const ZONA = "America/Mexico_City";

const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const hoyLocal = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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
}
const mensaje = (page, texto) => page.getByRole("status").filter({ hasText: texto }).first().waitFor();

const browser = await chromium.launch();
const dueno = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-MX" })).newPage();
const kiosco = await (await browser.newContext({ viewport: { width: 800, height: 1200 }, locale: "es-MX" })).newPage();
for (const p of [dueno, kiosco]) p.on("pageerror", (e) => console.error("Error en la página:", e.message));

try {
  // 1. Alta de empresa
  await entrar(dueno, DUENO, "/panel");
  await dueno.waitForURL(`${APP}/alta-empresa`);
  await dueno.getByLabel("Razón social o nombre del negocio").fill(EMPRESA);
  await dueno.getByLabel("RFC (opcional)").fill("XXX");
  await dueno.getByLabel("No, debe quedarse en el lugar").check();
  await dueno.getByRole("button", { name: "Crear empresa" }).click();
  await mensaje(dueno, "El RFC no tiene un formato válido.");
  paso("RFC inválido se rechaza con mensaje claro");
  await dueno.getByLabel("RFC (opcional)").fill("PET0101011A2");
  await dueno.getByRole("button", { name: "Crear empresa" }).click();
  await dueno.waitForURL(`${APP}/panel`);
  await dueno.getByText(/Primeros pasos \(\d de 6\)/).waitFor();
  paso("empresa creada; el dueño queda como propietario");

  // 2. Centro: la pausa cuenta como jornada
  await dueno.getByRole("link", { name: "Centros" }).click();
  await dueno.getByRole("heading", { name: "Centros de trabajo" }).waitFor();
  await dueno.getByLabel("El personal puede salir del lugar durante la pausa de comida").first().uncheck();
  await dueno.getByRole("button", { name: "Guardar" }).first().click();
  await mensaje(dueno, "Centro actualizado.");
  paso("centro configurado: la pausa cuenta como jornada (art. 64)");

  // 3. Trabajador con PIN
  await dueno.getByRole("link", { name: "Trabajadores" }).click();
  await dueno.getByRole("heading", { name: "Dar de alta" }).waitFor();
  await dueno.getByLabel("Nombre completo").fill("Carla Ruiz");
  await dueno.getByLabel("Número de empleado").fill(NUMERO);
  await dueno.getByLabel("Fecha de ingreso").fill("2026-01-10");
  await dueno.getByRole("button", { name: "Dar de alta" }).click();
  await dueno.getByRole("heading", { name: "Carla Ruiz" }).waitFor();
  await dueno.getByLabel("Nuevo PIN (4 a 6 dígitos)").fill("0000");
  await dueno.getByRole("button", { name: "Asignar PIN" }).click();
  await mensaje(dueno, "no ser obvio");
  await dueno.getByLabel("Nuevo PIN (4 a 6 dígitos)").fill("4826");
  await dueno.getByRole("button", { name: "Asignar PIN" }).click();
  await mensaje(dueno, "PIN asignado");
  paso("trabajador dado de alta; PIN obvio rechazado y PIN válido asignado");

  // 4. Invitar kiosco
  await dueno.getByRole("link", { name: "Accesos" }).click();
  await dueno.getByRole("heading", { name: "Accesos" }).waitFor();
  await dueno.getByLabel("Correo").fill(KIOSCO);
  await dueno.getByLabel("Centro (solo kiosco)").selectOption({ label: "Matriz" });
  await dueno.getByRole("button", { name: "Invitar" }).click();
  await mensaje(dueno, "Invitación creada");
  await dueno.getByText("invitación pendiente").waitFor();
  paso("kiosco invitado por correo, sin tocar SQL");

  // 5. El kiosco entra y la trabajadora checa
  await entrar(kiosco, KIOSCO, "/kiosco");
  await kiosco.waitForURL(`${APP}/kiosco`);
  await kiosco.getByText(`${EMPRESA} · Matriz`).waitFor();
  for (const valor of [NUMERO, "4826"]) {
    for (const d of valor) await kiosco.getByRole("button", { name: d, exact: true }).click();
    await kiosco.getByRole("button", { name: "Continuar" }).click();
  }
  await kiosco.getByRole("heading", { name: "Hola, Carla" }).waitFor({ timeout: 10000 });
  await kiosco.getByRole("button", { name: "Registrar entrada" }).click();
  await kiosco.getByText("Entrada registrada").waitFor();
  paso("el kiosco aceptó la invitación al entrar y la trabajadora checó con su PIN");

  // 5b. Búsqueda en la lista de trabajadores
  await dueno.goto(`${APP}/panel/trabajadores?q=CARLA`);
  await dueno.getByText(/^1 de \d+ personas?$/).waitFor();
  await dueno.locator("table.tabla tbody tr", { hasText: "Carla Ruiz" }).waitFor();
  paso("la búsqueda de trabajadores no distingue mayúsculas");

  // 6. Tablero
  await dueno.getByRole("link", { name: "Tablero" }).click();
  await dueno.getByRole("heading", { name: "En turno ahora" }).waitFor();
  await dueno.locator(".en-turno li", { hasText: "Carla Ruiz" }).getByText("Trabajando").waitFor();
  paso("el tablero muestra a Carla trabajando");

  // 7. Corrección, checada faltante y anulación
  await dueno.getByRole("link", { name: "Carla Ruiz" }).click();
  await dueno.getByRole("heading", { name: "Bitácora de la semana" }).waitFor();
  await dueno.getByText("kiosco", { exact: true }).waitFor();
  await dueno.getByText("Corregir o anular").first().click();
  await dueno.getByLabel("Hora correcta").fill(`${hoyLocal}T07:00`);
  await dueno.getByLabel("Motivo", { exact: true }).first().fill("Llegó a las 7:00; el kiosco estaba apagado");
  await dueno.getByRole("button", { name: "Corregir hora" }).click();
  await mensaje(dueno, "Corrección registrada");
  await dueno.getByText(/Corregida a .* 07:00 .*\(original: /).waitFor();
  paso("corrección registrada con motivo; se conserva la hora original");

  await dueno.getByRole("combobox", { name: "Tipo" }).selectOption("salida");
  await dueno.getByLabel("Fecha y hora").fill(`${hoyLocal}T08:00`);
  await dueno.locator("form", { hasText: "Agregar a la bitácora" }).getByLabel("Motivo").fill("Olvidó checar su salida");
  await dueno.getByRole("button", { name: "Agregar a la bitácora" }).click();
  await mensaje(dueno, "Checada agregada");
  await dueno.getByText("Capturada por el empleador: Olvidó checar su salida").waitFor();
  paso("checada faltante agregada con motivo");

  const salida = dueno.locator(".bitacora li", { hasText: "Capturada por el empleador" });
  await salida.getByText("Corregir o anular").click();
  await salida.getByLabel("Motivo de la anulación").fill("Capturada por error");
  await salida.getByRole("button", { name: "Anular checada" }).click();
  // Al anularse desaparece el formulario (ya no se puede corregir); la confirmación es el tachado.
  await dueno.locator(".bitacora li", { hasText: "Anulada" }).locator(".tachado").first().waitFor();
  paso("checada anulada: aparece tachada y con su motivo");

  // 8. Integridad
  await dueno.getByRole("link", { name: "Tablero" }).click();
  await dueno.getByRole("heading", { name: "En turno ahora" }).waitFor();
  await dueno.getByRole("button", { name: "Verificar ahora" }).click();
  await mensaje(dueno, "La bitácora está íntegra");
  paso("verificación de integridad desde el panel");

  // 9. Accesos: el kiosco ya es miembro; quitarle el acceso
  await dueno.getByRole("link", { name: "Accesos" }).click();
  await dueno.getByRole("heading", { name: "Accesos" }).waitFor();
  const fila = dueno.getByRole("row", { name: new RegExp(KIOSCO.replace(/\./g, "\\.")) });
  await fila.getByRole("cell", { name: "Kiosco", exact: true }).waitFor();
  await fila.getByRole("button", { name: "Quitar acceso" }).click();
  await fila.waitFor({ state: "detached" });
  paso("la invitación quedó aceptada y el acceso del kiosco se puede quitar");

  // 10. Baja
  await dueno.getByRole("link", { name: "Trabajadores" }).click();
  await dueno.getByRole("heading", { name: "Dar de alta" }).waitFor();
  await dueno.getByRole("link", { name: "Carla Ruiz" }).click();
  await dueno.getByRole("heading", { name: "Baja" }).waitFor();
  await dueno.getByLabel("Escribe BAJA para confirmar").fill("BAJA");
  await dueno.getByRole("button", { name: "Registrar baja" }).click();
  await dueno.getByText(/Dado de baja el \d{4}-\d{2}-\d{2}/).waitFor();
  await dueno.getByRole("link", { name: "← Trabajadores" }).click();
  await dueno.getByText("Aún no hay trabajadores.").waitFor();
  paso("baja registrada; los registros se conservan");

  // 11. Deshacer la baja (fue un error)
  await dueno.goto(`${APP}/panel/trabajadores?bajas=1`);
  await dueno.getByRole("link", { name: "Carla Ruiz" }).click();
  await dueno.getByRole("heading", { name: "¿La baja fue un error?" }).waitFor();
  await dueno.getByLabel("Motivo").fill("Se registró la baja de la persona equivocada");
  await dueno.getByRole("button", { name: "Deshacer la baja" }).click();
  await dueno.getByText(/Baja del \d{4}-\d{2}-\d{2} deshecha/).waitFor();
  await dueno.getByText("Motivo: Se registró la baja de la persona equivocada").waitFor();
  if (await dueno.getByText(/Dado de baja el/).count()) throw new Error("La persona debía quedar activa");
  await dueno.goto(`${APP}/panel/trabajadores`);
  await dueno.getByRole("link", { name: "Carla Ruiz" }).waitFor();
  paso("la baja se deshace con motivo; la persona vuelve a la lista y el historial conserva ambos pasos");

  const conteo = sql(`select count(*) filter (where e.tipo in ('correccion','anulacion')) || ',' || count(*)
                      from eventos e join empresas x on x.id = e.empresa_id where x.razon_social = '${EMPRESA}'`);
  if (conteo !== "2,4") throw new Error(`Bitácora inesperada (ajustes,total): ${conteo}`);
  paso("en la base: 4 eventos (entrada, salida, corrección y anulación); nada se borró");
  console.log("\nPrueba del panel: OK");
} catch (e) {
  await dueno.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  await kiosco.screenshot({ path: "e2e-fallo-kiosco.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(capturas en e2e-fallo*.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
