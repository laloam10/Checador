// Prueba de punta a punta del alta masiva de trabajadores desde un CSV.
// Uso: node apps/web/e2e/alta-masiva.e2e.mjs   (requiere app y Supabase local, como panel.e2e.mjs)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36);
const DUENO = `dueno.${sufijo}@masiva.mx`;
const EMPRESA = `Abarrotes La Masiva ${sufijo}`;

const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();

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
const subir = async (page, nombre, contenido, codificacion = "utf8") => {
  await page.getByLabel("Archivo CSV").setInputFiles({ name: nombre, mimeType: "text/csv", buffer: Buffer.from(contenido, codificacion) });
  await page.getByRole("button", { name: "Revisar y dar de alta" }).click();
};

const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-MX", acceptDownloads: true })).newPage();
p.on("pageerror", (e) => console.error("Error en la página:", e.message));

try {
  await entrar(p, DUENO, "/panel");
  await p.waitForURL(`${APP}/alta-empresa`);
  await p.getByLabel("Razón social o nombre del negocio").fill(EMPRESA);
  await p.getByLabel("Nombre de tu primer centro de trabajo").fill("Matriz");
  await p.getByLabel("Sí, puede salir").check();
  await p.getByRole("button", { name: "Crear empresa" }).click();
  await p.waitForURL(`${APP}/panel`);
  const empresa = sql(`select id from empresas where razon_social = '${EMPRESA}'`);

  // 1. Plantilla
  await p.goto(`${APP}/panel/trabajadores`);
  await p.getByText("Dar de alta a varias personas desde Excel").click();
  const [descarga] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "plantilla" }).click()]);
  const plantilla = (await (await descarga.createReadStream()).toArray()).join("");
  if (!plantilla.startsWith("﻿nombre,numero_empleado,correo") || !plantilla.includes(",Matriz,15/03/2026,domingo")) {
    throw new Error(`Plantilla inesperada: ${plantilla.slice(0, 120)}`);
  }
  paso("la plantilla se descarga con encabezados, un ejemplo y el centro de la empresa");

  // 2. Un archivo con errores no da de alta a nadie
  await subir(p, "con-errores.csv", "nombre,numero_empleado,correo,fecha_ingreso\nAna,1,,01/02/2026\nBeto,1,,31/02/2026\n");
  await p.getByText(/No se dio de alta a nadie[\s\S]*Renglón 3: el número 1 ya existe o está repetido; fecha de ingreso inválida/).waitFor();
  if (sql(`select count(*) from trabajadores where empresa_id = '${empresa}'`) !== "0") throw new Error("Se dio de alta a alguien con errores");
  paso("un archivo con errores se rechaza completo, indicando renglón y motivo");

  // 3. Archivo de Excel en Windows-1252 con punto y coma
  const csv = [
    "Nombre completo;Número de empleado;Correo;Centro de trabajo;Fecha de ingreso;Día de descanso",
    "José Ñúñez;201;;matriz;01/03/2026;sábado",
    "Lucía Gómez;202;lucia.masiva@ejemplo.mx;;15/03/2026;",
    "Raúl Pérez;;raul.masiva@ejemplo.mx;Matriz;2026-04-01;lunes",
  ].join("\r\n");
  await subir(p, "personal.csv", csv, "latin1");
  await p.getByText("Se dio de alta a 3 personas.").waitFor();
  const filas = sql(`select nombre || '|' || coalesce(numero_empleado, '') || '|' || coalesce(email, '') || '|' || fecha_ingreso || '|' || dia_descanso
                       from trabajadores where empresa_id = '${empresa}' order by nombre`).split("\n");
  const esperado = [
    "José Ñúñez|201||2026-03-01|6",
    "Lucía Gómez|202|lucia.masiva@ejemplo.mx|2026-03-15|0",
    "Raúl Pérez||raul.masiva@ejemplo.mx|2026-04-01|1",
  ];
  if (JSON.stringify(filas) !== JSON.stringify(esperado)) throw new Error(`Altas inesperadas: ${JSON.stringify(filas)}`);
  await p.locator("table.tabla tbody tr", { hasText: "José Ñúñez" }).waitFor();
  paso("un CSV de Excel (Windows-1252, punto y coma, acentos y ñ) da de alta a las 3 personas");

  // 4. Volver a subirlo choca con los números y correos ya existentes
  await subir(p, "personal.csv", csv, "latin1");
  await p.getByText(/Renglón 2: el número 201 ya existe/).waitFor();
  if (sql(`select count(*) from trabajadores where empresa_id = '${empresa}'`) !== "3") throw new Error("Se duplicaron altas");
  paso("subir el mismo archivo dos veces no duplica a nadie");

  console.log("\nPrueba del alta masiva: OK");
} catch (e) {
  await p.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
