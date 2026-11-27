// Exporta la guía rápida (/guia) como un HTML independiente para publicarlo en jemba.mx:
// estilos y fuentes incrustados, enlaces absolutos a la app y pestañas Android/iPhone sin
// JavaScript (radios + CSS). Se genera a partir de la página real, así que no hay que
// mantener dos copias del texto.
// Uso: node scripts/guia-html.mjs [http://127.0.0.1:3000]   (requiere la app corriendo)
// Salida: docs/publicar/guia-rapida-checador.html
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.argv[2] ?? "http://127.0.0.1:3000";
const DOMINIO = "checador.jemba.mx";
const SALIDA = fileURLToPath(new URL("../docs/publicar/guia-rapida-checador.html", import.meta.url));

const b = await chromium.launch();
// La página toma el dominio del encabezado: así el paso "Abre checador.jemba.mx" queda correcto.
const pagina = await (await b.newContext({ extraHTTPHeaders: { "x-forwarded-host": DOMINIO } })).newPage();
await pagina.goto(`${APP}/guia`);
await pagina.evaluate(() => document.fonts.ready);

const resultado = await pagina.evaluate(async () => {
  const main = document.querySelector("main.guia");
  // Pasos de cada pestaña (la página solo muestra uno a la vez)
  const pasos = {};
  const nota = {};
  for (const s of ["android", "iphone"]) {
    document.getElementById(`pestana-${s}`).click();
    await new Promise((r) => setTimeout(r, 50));
    pasos[s] = document.getElementById("pasos-instalacion").innerHTML;
    nota[s] = main.querySelector(".guia-nota").innerHTML;
  }
  // Reglas CSS que usa la guía (más :root, html —ahí van las variables de las fuentes—, body y fuentes)
  const usadas = [];
  const fuentes = [];
  const aplica = (sel) => {
    try {
      return sel.split(",").some((p) => {
        const base = p.replace(/::?(before|after|backdrop|marker|-webkit-details-marker)\b/g, "").replace(/:(hover|focus|focus-visible|active|checked)\b/g, "").replace(/\[open\]/g, "").trim();
        return /^(:root|html|body|\*)/.test(base) || (base && (document.documentElement.matches(base) || main.matches(base) || main.querySelector(base)));
      });
    } catch { return false; }
  };
  const recorrer = (reglas, dentro) => {
    for (const r of reglas) {
      if (r instanceof CSSFontFaceRule) {
        // Solo el juego latino (cubre el español: acentos, ñ, ¿, ¡); las direcciones de las
        // fuentes son relativas a la hoja de estilos.
        const rango = r.style.getPropertyValue("unicode-range");
        if (rango && !/U\+0+-F{2}\b/i.test(rango)) continue;
        const base = r.parentStyleSheet?.href ?? location.href;
        fuentes.push(r.cssText.replace(/url\("?([^")]+)"?\)/g, (_, u) => `url("${new URL(u, base).href}")`));
      }
      else if (r instanceof CSSStyleRule) { if (aplica(r.selectorText)) usadas.push(dentro ? { dentro, css: r.cssText } : r.cssText); }
      else if (r instanceof CSSMediaRule) recorrer(r.cssRules, r.conditionText);
    }
  };
  for (const hoja of document.styleSheets) { try { recorrer(hoja.cssRules); } catch {} }
  const medios = {};
  const css = usadas.filter((u) => typeof u === "string");
  for (const u of usadas.filter((u) => typeof u !== "string")) (medios[u.dentro] ??= []).push(u.css);
  for (const [m, reglas] of Object.entries(medios)) css.push(`@media ${m} { ${reglas.join(" ")} }`);
  return { html: main.outerHTML, pasos, nota, css: css.join("\n"), fuentes, clasesHtml: document.documentElement.className };
});

// Fuentes incrustadas (solo las que usa la guía; next/font las sirve desde /_next/static/media)
let fuentes = "";
for (const f of resultado.fuentes) {
  const url = /url\("?([^")]+)"?\)/.exec(f)?.[1];
  if (!url) continue;
  const r = await fetch(url);
  const tipo = r.headers.get("content-type") ?? "";
  if (!r.ok || !/font|octet-stream/.test(tipo)) throw new Error(`La fuente ${url} no se descargó (${r.status} ${tipo})`);
  const datos = Buffer.from(await r.arrayBuffer()).toString("base64");
  fuentes += f.replace(/url\("?[^")]+"?\)/, `url(data:font/woff2;base64,${datos})`) + "\n";
}

// Pestañas sin JavaScript: dos radios y CSS que muestra la lista elegida.
const lista = (s) => `<ol class="guia-lista guia-lista-${s}">${resultado.pasos[s]}</ol><p class="guia-nota guia-nota-${s}">${resultado.nota[s]}</p>`;
const pestanas = `<input type="radio" name="sistema" id="sistema-android" class="guia-radio" checked>
<input type="radio" name="sistema" id="sistema-iphone" class="guia-radio">
<div class="guia-pestanas"><label for="sistema-android">Android</label><label for="sistema-iphone">iPhone</label></div>
${lista("android")}${lista("iphone")}`;
let html = resultado.html
  .replace(/<div class="guia-pestanas"[\s\S]*?<\/p>/, pestanas) // pestañas, lista y nota de la app
  .replace(/href="\/(?!\/)/g, `href="https://${DOMINIO}/`)
  .replace(/ (aria-controls|aria-labelledby|role)="(tab|tablist|tabpanel|pestana-[a-z]+|pasos-instalacion)"/g, "");

const cssPestanas = `
.guia-radio { position: absolute; opacity: 0; pointer-events: none; }
.guia-pestanas label { text-align: center; padding: 0.6rem; border-radius: var(--radio-chico); font-weight: 600; color: var(--gris); cursor: pointer; }
#sistema-android:checked ~ .guia-pestanas label[for="sistema-android"],
#sistema-iphone:checked ~ .guia-pestanas label[for="sistema-iphone"] { background: var(--superficie); color: var(--noche); box-shadow: var(--sombra); }
#sistema-android:focus-visible ~ .guia-pestanas label[for="sistema-android"],
#sistema-iphone:focus-visible ~ .guia-pestanas label[for="sistema-iphone"] { outline: 2px solid var(--marca); }
#sistema-android:checked ~ .guia-lista-iphone, #sistema-android:checked ~ .guia-nota-iphone,
#sistema-iphone:checked ~ .guia-lista-android, #sistema-iphone:checked ~ .guia-nota-android { display: none; }
/* Sin scripts la calculadora no respondería: se oculta y quedan los tramos y los ejemplos. */
.sin-js .calculadora { display: none; }
.sin-js .guia-precios { grid-template-columns: 1fr; }`;

// Preselecciona iPhone en iPhone si el sitio permite scripts (si no, queda Android).
// Calculadora de precios: lee los textos ya calculados (data-precios, de lib/precios.ts).
// Sin scripts, la tabla de tramos y los ejemplos siguen visibles.
const script = `<script>
document.documentElement.classList.remove("sin-js");
if (/iPhone|iPad|iPod/.test(navigator.userAgent)) document.getElementById("sistema-iphone").checked = true;
(function () {
  var c = document.querySelector(".calculadora");
  if (!c) return;
  var d = JSON.parse(c.getAttribute("data-precios"));
  var r = c.querySelector("input[type=range]");
  var m = d.length;
  var $ = function (id) { return document.getElementById(id); };
  function pintar() {
    var n = Number(r.value), e = d[n - 1];
    $("calculadora-cuantas").textContent = n === m ? "Más de " + (m - 1) : String(n);
    $("calculadora-total").textContent = e.total;
    $("calculadora-unidad").textContent = n < m ? " al mes + IVA" : "";
    $("calculadora-detalle").textContent = e.detalle;
    r.setAttribute("aria-valuetext", n === m ? "Más de " + (m - 1) + " personas" : n + " personas");
  }
  r.addEventListener("input", pintar);
  pintar();
})();
</script>`;

const documento = `<!doctype html>
<html lang="es-MX" class="${resultado.clasesHtml} sin-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guía rápida · Checador</title>
<meta name="description" content="Instala Checador y empieza a registrar la jornada de tu negocio: pasos para la empresa y para su personal.">
<meta property="og:title" content="Guía rápida · Checador">
<meta property="og:description" content="Instala Checador y empieza a registrar la jornada de tu negocio.">
<meta property="og:image" content="https://${DOMINIO}/opengraph-image.png">
<link rel="icon" href="https://${DOMINIO}/icon.svg" type="image/svg+xml">
<!-- Generado con scripts/guia-html.mjs a partir de https://${DOMINIO}/guia. No editar a mano. -->
<style>
${fuentes}${resultado.css}
${cssPestanas}
</style>
</head>
<body>
${html}
${script}
</body>
</html>
`;
mkdirSync(new URL("../docs/publicar/", import.meta.url), { recursive: true });
writeFileSync(SALIDA, documento);
console.log(`docs/publicar/guia-rapida-checador.html (${Math.round(documento.length / 1024)} KB)`);
await b.close();
