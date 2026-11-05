// Prueba de punta a punta de la exportación para inspección o juicio contra Supabase local.
// Requiere semilla.sql (semana del 2026-10-26 de Ana) y que exista dueno.espiga@ejemplo.mx
// (lo crea acuerdo.e2e.mjs). Usa `pdftotext` (poppler-utils) para leer el PDF.
// Uso: node apps/web/e2e/exportar.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ANA = "aaaaaaaa-0000-0000-0000-000000000003";
const DUENO = "dueno.espiga@ejemplo.mx";
const dir = mkdtempSync(join(tmpdir(), "checador-e2e-"));

const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();
const sha = (b) => createHash("sha256").update(b).digest("hex");
function afirmar(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 1000 }, locale: "es-MX", acceptDownloads: true })).newPage();
page.on("pageerror", (e) => console.error("Error en la página:", e.message));

async function exportar(trabajador, formato) {
  await page.locator("select[name=trabajador]").selectOption(trabajador);
  await page.locator("input[name=desde]").fill("2026-10-28"); // miércoles: debe ajustarse al lunes 26
  await page.locator("input[name=hasta]").fill("2026-10-30");
  await page.locator("select[name=formato]").selectOption(formato);
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar" }).click()]);
  const ruta = join(dir, descarga.suggestedFilename());
  await descarga.saveAs(ruta);
  await page.getByRole("status").filter({ hasText: "Huella SHA-256" }).waitFor();
  return { ruta, nombre: descarga.suggestedFilename(), bytes: readFileSync(ruta) };
}

try {
  // Entrar como dueño
  await page.goto(`${APP}/panel/exportar?trabajador=${ANA}`);
  await page.waitForURL(/\/entrar/);
  const desde = Date.now() - 1000;
  await page.getByLabel("Tu correo").fill(DUENO);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  let codigo;
  for (let i = 0; i < 30 && !codigo; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${DUENO}`)}`)).json();
    const m = messages.find((x) => Date.parse(x.Created) >= desde);
    if (m) codigo = /\b(\d{6})\b/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text)?.[1];
    if (!codigo) await new Promise((r) => setTimeout(r, 500));
  }
  await page.getByLabel("Código").fill(codigo);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/panel\/exportar/);
  await page.getByRole("heading", { name: "Exportar para inspección o juicio" }).waitFor();

  // 1. PDF
  const pdf = await exportar(ANA, "pdf");
  afirmar(pdf.bytes.subarray(0, 4).toString() === "%PDF", "El archivo no es un PDF");
  afirmar(pdf.nombre === "checador_pdf_001_2026-10-26_2026-11-01.pdf", `Nombre inesperado: ${pdf.nombre}`);
  const texto = execFileSync("pdftotext", ["-layout", pdf.ruta, "-"], { encoding: "utf8" });
  for (const esperado of [
    "REGISTRO ELECTRÓNICO DE LA JORNADA DE TRABAJO", "Ana Pérez", "2026-10-26 al 2026-11-01",
    "ningún registro de la empresa ha sido alterado", "Acuerdo de registro electrónico", "Bitácora completa del periodo",
    "Carga de prueba",
  ]) afirmar(texto.includes(esperado), `El PDF no contiene: ${esperado}`);
  afirmar(/Total del periodo: trabajado 50:00 · ordinaria 48:00 · extra al doble 2:00/.test(texto), "Totales del PDF incorrectos");
  const registro = sql(`select encode(hash_archivo,'hex') || ',' || desde || ',' || hasta || ',' || cadena_integra
                        from exportaciones where formato = 'pdf' order by generado_en desc limit 1`);
  afirmar(registro === `${sha(pdf.bytes)},2026-10-26,2026-11-01,true`, `Registro de la exportación inesperado: ${registro}`);
  paso("PDF: periodo ajustado a semanas completas, totales correctos (50:00, 2:00 extra) y huella registrada");

  // 2. CSV resumen de Ana
  const resumen = (await exportar(ANA, "csv_resumen")).bytes.toString("utf8");
  afirmar(resumen.startsWith("﻿"), "El CSV debe llevar BOM para Excel");
  const total = resumen.split("\r\n").find((l) => l.includes(",2026-10-26,total_semana,"));
  afirmar(total && total.split(",").slice(6, 10).join(",") === "3000,2880,120,0", `Fila de total inesperada: ${total}`);
  paso("CSV resumen: total semanal en minutos exactos (3000 trabajados, 120 extra al doble)");

  // 3. CSV bitácora de todos
  const bitacora = (await exportar("todos", "csv_bitacora")).bytes.toString("utf8");
  const filasAna = bitacora.split("\r\n").filter((l) => l.startsWith("001,Ana Pérez,")).length;
  const enBase = Number(sql(`select count(*) from eventos where trabajador_id = '${ANA}'
    and (hora_efectiva at time zone 'America/Mexico_City')::date between '2026-10-26' and '2026-11-01'
    and corrige_evento_id is null`));
  afirmar(filasAna >= enBase && enBase === 24, `Filas de Ana en la bitácora: ${filasAna}, en la base: ${enBase}`);
  paso(`CSV bitácora (todos): las ${enBase} checadas de Ana del periodo, con su huella por registro`);

  // 4. Verificación de archivos
  await page.getByLabel("Archivo a verificar").setInputFiles(pdf.ruta);
  await page.getByRole("status").filter({ hasText: "Archivo auténtico e íntegro" }).waitFor();
  const alterado = join(dir, "alterado.pdf");
  const copia = Buffer.from(pdf.bytes);
  copia[copia.length - 20] ^= 1; // un solo bit cambiado
  writeFileSync(alterado, copia);
  await page.getByLabel("Archivo a verificar").setInputFiles(alterado);
  await page.getByRole("status").filter({ hasText: "NO coincide" }).waitFor();
  paso("verificación: el PDF original se reconoce como auténtico y un cambio de un solo bit se detecta");

  await page.reload();
  await page.getByRole("heading", { name: "Exportaciones recientes" }).waitFor();
  await page.getByRole("cell", { name: `${sha(pdf.bytes).slice(0, 16)}…` }).waitFor();
  paso("la exportación aparece en el historial con su huella");

  console.log("\nPrueba de exportación: OK");
} catch (e) {
  await page.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  console.error("\nFALLÓ:", e.message, "\n(captura en e2e-fallo.png)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
