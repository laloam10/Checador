// Prueba de punta a punta del alta guiada: de una empresa nueva hasta tener todo en orden.
// Uso: node apps/web/e2e/alta-guiada.e2e.mjs   (requiere app y Supabase local)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const s = Date.now().toString(36);
const DUENO = `dueno.${s}@tortilleria.mx`;
const KIOSCO = `kiosco.${s}@tortilleria.mx`;
const LUCIA = `lucia.${s}@tortilleria.mx`;
const NUM_MARIO = String(Date.now()).slice(-5);

const paso = (t) => console.log(`✓ ${t}`);
const estado = (p, t) => p.getByRole("status").filter({ hasText: t }).first().waitFor();

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

const browser = await chromium.launch();
const nueva = async () => (await browser.newContext({ viewport: { width: 1100, height: 1000 }, locale: "es-MX" })).newPage();
const p = await nueva();
p.on("pageerror", (e) => console.error("Error en la página:", e.message));
const tablero = async () => {
  await p.goto(`${APP}/panel`);
  await p.getByRole("heading", { name: "En turno ahora" }).waitFor();
};
// Indicador "Acuerdos vigentes" del tablero ("0 de 2", con "de 2" en otra etiqueta).
const acuerdosVigentes = (valor) =>
  p.locator(".indicador", { hasText: "Acuerdos vigentes" })
    .locator(".indicador-valor", { hasText: new RegExp(`^\\s*${valor.replace(" de ", "\\s*de\\s*")}\\s*$`) })
    .waitFor();
const pasoHecho = (titulo) => p.locator(".primeros-pasos li.hecho", { hasText: titulo });
const pasoPendiente = (titulo) => p.locator(".primeros-pasos li:not(.hecho)", { hasText: titulo });

async function altaTrabajador(nombre, { email, numero }) {
  await p.goto(`${APP}/panel/trabajadores`);
  await p.getByRole("heading", { name: "Dar de alta" }).waitFor();
  await p.getByLabel("Nombre completo").fill(nombre);
  if (numero) await p.getByLabel("Número de empleado").fill(numero);
  if (email) await p.getByLabel("Correo (opcional)").fill(email);
  await p.getByLabel("Fecha de ingreso").fill("2026-11-01");
  await p.getByRole("button", { name: "Dar de alta" }).click();
  await p.getByRole("heading", { name: nombre }).waitFor();
}

try {
  // 1. Alta de empresa: la regla de la pausa es obligatoria
  await entrar(p, DUENO, "/panel");
  await p.waitForURL(`${APP}/alta-empresa`);
  await p.getByLabel("Razón social o nombre del negocio").fill(`Tortillería La Esperanza ${s}`);
  await p.getByRole("button", { name: "Crear empresa" }).click();
  await p.waitForTimeout(500);
  if (!p.url().endsWith("/alta-empresa")) throw new Error("Se creó la empresa sin responder la pregunta de la pausa");
  await p.getByLabel("No, debe quedarse en el lugar").check();
  await p.getByRole("button", { name: "Crear empresa" }).click();
  await p.waitForURL(`${APP}/panel`);
  await p.getByRole("heading", { name: "Primeros pasos (2 de 6)" }).waitFor();
  await pasoHecho("Registra tu centro de trabajo").waitFor();
  await pasoPendiente("Da de alta a tu personal").waitFor();
  paso("alta de empresa: la regla de la pausa es obligatoria; el tablero muestra 2 de 6 pasos");

  await p.goto(`${APP}/panel/centros`);
  if (await p.getByLabel("El personal puede salir del lugar durante la pausa de comida").first().isChecked()) {
    throw new Error("El centro debió crearse con 'no puede salir'");
  }
  paso("el centro quedó configurado como 'no puede salir' (la comida cuenta como jornada, art. 64)");

  // 2. Personal: una con app, otro solo con kiosco y aún sin PIN
  await altaTrabajador("Lucía Gómez", { email: LUCIA });
  const fichaMario = await (async () => { await altaTrabajador("Mario Díaz", { numero: NUM_MARIO }); return p.url(); })();
  await tablero();
  await pasoHecho("Da de alta a tu personal").waitFor();
  await pasoPendiente("Cada persona tiene cómo checar").getByText("Mario Díaz").waitFor();
  await pasoPendiente("Instala un kiosco (1 persona(s) sin correo").waitFor();
  paso("el tablero detecta que Mario no tiene cómo checar y que hace falta un kiosco");

  // 3. PIN de Mario e invitación del kiosco
  await p.goto(fichaMario);
  await p.getByLabel("Nuevo PIN (4 a 6 dígitos)").fill("3917");
  await p.getByRole("button", { name: "Asignar PIN" }).click();
  await estado(p, "PIN asignado");
  await p.goto(`${APP}/panel/accesos`);
  await p.getByRole("heading", { name: "Accesos" }).waitFor();
  await p.getByLabel("Correo").fill(KIOSCO);
  await p.getByRole("button", { name: "Invitar" }).click();
  await estado(p, "Invitación creada");
  await tablero();
  await pasoHecho("Cada persona tiene cómo checar").waitFor();
  await pasoPendiente("Instala un kiosco").getByText(`entra con ${KIOSCO}`).waitFor();
  paso("con PIN e invitación, el tablero explica cómo terminar de instalar el kiosco");

  const kiosco = await nueva();
  await entrar(kiosco, KIOSCO, "/kiosco");
  await kiosco.getByRole("heading", { name: "Número de empleado" }).waitFor();
  await kiosco.close();
  await tablero();
  await pasoHecho("Instala un kiosco").waitFor();
  paso("al entrar la tableta con ese correo, el paso del kiosco se completa solo");

  // 4. Acuerdos en lote
  await p.goto(`${APP}/panel/trabajadores`);
  await p.locator("table.tabla").getByText("Sin acuerdo", { exact: true }).first().waitFor();
  await p.getByText(/Ver el texto \(ejemplo:/).click();
  await p.locator("#acuerdos pre.texto-acuerdo").filter({ hasText: "ACUERDO PARA EL REGISTRO" }).waitFor();
  const lote = p.getByRole("button", { name: "Generar y firmar 2 acuerdo(s) como empresa" });
  await lote.click();
  await estado(p, "Confirma que revisaste el texto");
  await p.getByLabel(/Revisé el texto y firmo estos acuerdos/).check();
  await lote.click();
  await p.getByText("La empresa ya firmó el acuerdo de todo su personal.").waitFor();
  if ((await p.getByText("Falta su firma", { exact: true }).count()) !== 2) throw new Error("Debían quedar 2 acuerdos esperando firma");
  await tablero();
  await pasoHecho("Firma los acuerdos de registro como empresa").waitFor();
  await pasoPendiente("Cada persona firma su acuerdo").getByText(/Esperando a: .*Lucía Gómez.*Mario Díaz/).waitFor();
  await acuerdosVigentes("0 de 2");
  paso("la empresa firmó los 2 acuerdos de una vez, tras revisar el texto y confirmar");

  // 5. Firmas del personal (en papel, para esta prueba)
  for (const nombre of ["Lucía Gómez", "Mario Díaz"]) {
    await p.goto(`${APP}/panel/trabajadores`);
    await p.getByRole("link", { name: nombre }).click();
    await p.getByText("Registrar firma en papel").click();
    await p.getByLabel("Fecha de firma").fill("2026-11-05");
    await p.getByLabel("Dónde se resguarda el original").fill("Expediente físico");
    await p.getByLabel(/El documento firmado tiene impreso el folio/).check();
    await p.getByRole("button", { name: "Registrar firma autógrafa" }).click();
    await p.getByText(/Vigente: versión 1/).waitFor();
  }
  await tablero();
  await acuerdosVigentes("2 de 2");
  if (await p.locator(".primeros-pasos").count()) throw new Error("La lista de primeros pasos debía desaparecer");
  paso("con todo firmado, la lista de primeros pasos desaparece y el tablero muestra 2 de 2");

  // 6. Cambio posterior de jornada: el acuerdo queda desactualizado y la lista vuelve
  await p.goto(fichaMario);
  await p.getByLabel("Descanso semanal obligatorio").selectOption("6");
  await p.getByRole("button", { name: "Guardar cambios" }).click();
  await estado(p, "Datos actualizados");
  await p.goto(`${APP}/panel/trabajadores`);
  await p.getByRole("row", { name: /Mario Díaz/ }).getByText("Desactualizado").waitFor();
  await tablero();
  await pasoPendiente("Firma los acuerdos de registro como empresa").getByText(/Faltan 1: Mario Díaz/).waitFor();
  await acuerdosVigentes("1 de 2");
  paso("al cambiar el día de descanso de Mario, su acuerdo queda desactualizado y el tablero lo vuelve a pedir");

  // 7. Descanso adicional (semana de 5 días): solo cambia el acuerdo de quien lo tiene
  await p.goto(`${APP}/panel/trabajadores`);
  await p.getByRole("link", { name: "Lucía Gómez" }).click();
  await p.getByRole("heading", { name: "Lucía Gómez" }).waitFor();
  await p.getByRole("checkbox", { name: "Sábado" }).check();
  await p.getByRole("button", { name: "Guardar cambios" }).click();
  await estado(p, "Datos actualizados");
  await p.reload();
  if (!(await p.getByRole("checkbox", { name: "Sábado" }).isChecked())) throw new Error("El sábado adicional no se guardó");
  if ((await p.getByLabel("Descanso semanal obligatorio").inputValue()) !== "0") throw new Error("El descanso obligatorio debía seguir en domingo");
  await p.getByText(/descansará el sábado, como descanso adicional pactado/).first().waitFor({ state: "attached" });
  await p.goto(`${APP}/panel/trabajadores`);
  await p.getByRole("row", { name: /Lucía Gómez/ }).getByText("Desactualizado").waitFor();
  await p.getByRole("row", { name: /Mario Díaz/ }).getByText("Desactualizado").waitFor();
  paso("un sábado adicional se guarda aparte del descanso obligatorio y desactualiza solo el acuerdo de esa persona");

  console.log("\nPrueba del alta guiada: OK");
} catch (e) {
  await p.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
