// Genera los PDF de docs/manual/ a partir de manual.html y hojas/*.html (usa las capturas de img/).
// Uso (desde la raíz del repositorio): node docs/manual/fuente/generar.cjs
const { chromium } = require("playwright");
const path = require("path");

const FUENTE = __dirname;
const SALIDA = path.join(__dirname, "..");
const PIE = '<div style="font-size:8pt;color:#888;width:100%;text-align:center;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>';
const CABEZA = '<div style="font-size:7.5pt;color:#888;width:100%;padding:0 18mm;text-align:right;font-family:sans-serif">Checador · Manual de usuario</div>';

const documentos = [
  { html: "manual.html", pdf: "manual-de-usuario.pdf", numerar: true },
  { html: "hojas/trabajador.html", pdf: "hoja-trabajador.pdf", paginas: 1 },
  { html: "hojas/kiosco.html", pdf: "hoja-kiosco.pdf", paginas: 1 },
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  let fallas = 0;
  for (const d of documentos) {
    await p.goto("file://" + path.join(FUENTE, d.html), { waitUntil: "networkidle" });
    const rotas = await p.$$eval("img", (ims) => ims.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute("src")));
    if (rotas.length) { console.error(`✗ ${d.html}: imágenes que no cargan: ${rotas.join(", ")}`); fallas++; continue; }
    const destino = path.join(SALIDA, d.pdf);
    const pdf = await p.pdf({
      path: destino, format: "A4", printBackground: true, preferCSSPageSize: true,
      ...(d.numerar ? { displayHeaderFooter: true, headerTemplate: CABEZA, footerTemplate: PIE } : {}),
    });
    const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    const ok = !d.paginas || paginas === d.paginas;
    fallas += !ok;
    console.log(`${ok ? "✓" : "✗"} ${path.relative(process.cwd(), destino)}: ${paginas} página(s)${ok ? "" : ` (se esperaba ${d.paginas}: el contenido ya no cabe)`}`);
  }
  await b.close();
  process.exit(fallas ? 1 : 0);
})();
