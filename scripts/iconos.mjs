// Genera los íconos PNG de la app (public/) a partir de apps/web/app/icon.svg.
// Uso: node scripts/iconos.mjs   (requiere Playwright con Chromium)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const svg = readFileSync(`${web}app/icon.svg`, "utf8");
// Contenido del ícono sin el fondo redondeado, para las variantes a sangre completa.
const interior = svg.replace(/<rect[^>]*\/>/, "").replace(/^<svg[^>]*>|<\/svg>$/g, "");
const VERDE = "#0E6B50";

const variantes = [
  // iOS redondea por su cuenta y no admite transparencia: fondo completo.
  { archivo: "icon-180.png", tamano: 180, html: completo(1) },
  { archivo: "icon-192.png", tamano: 192, html: svg },
  { archivo: "icon-512.png", tamano: 512, html: svg },
  // Android recorta con su propia forma: la marca dentro de la zona segura (80 %).
  { archivo: "icon-maskable-512.png", tamano: 512, html: completo(0.8) },
];

function completo(escala) {
  const d = (64 * (1 - escala)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${VERDE}"/><g transform="translate(${d} ${d}) scale(${escala})">${interior}</g></svg>`;
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const v of variantes) {
  await pagina.setViewportSize({ width: v.tamano, height: v.tamano });
  await pagina.setContent(`<html><body style="margin:0;background:transparent">${v.html.replace("<svg ", `<svg width="${v.tamano}" height="${v.tamano}" `)}</body></html>`);
  await pagina.screenshot({ path: `${web}public/${v.archivo}`, omitBackground: true });
  console.log("✓", v.archivo);
}
await navegador.close();
