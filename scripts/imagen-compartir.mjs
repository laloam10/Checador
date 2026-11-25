// Genera la imagen que aparece al compartir un enlace de Checador (WhatsApp, Facebook, correo):
// apps/web/app/opengraph-image.png (1200 × 630). Usa las fuentes de la app, así que necesita la
// app corriendo (npm run dev o next start).
// Uso: node scripts/imagen-compartir.mjs [http://127.0.0.1:3000]   (requiere Playwright con Chromium)
// Sin promesas de "cumplimiento garantizado" ni "certificación" (CLAUDE.md).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.argv[2] ?? "http://127.0.0.1:3000";
const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const isotipo = readFileSync(`${web}app/icon.svg`, "utf8");

const html = `
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; }
  .lienzo { position: relative; width: 1200px; height: 630px; padding: 64px 72px; color: #eaf2d6;
    font-family: var(--fuente-texto), sans-serif;
    background: radial-gradient(900px 520px at 100% 110%, rgb(200 230 0 / 0.16), transparent 70%),
                radial-gradient(700px 420px at -10% -20%, rgb(47 110 16 / 0.55), transparent 70%), #0a2103; }
  .marca { display: flex; align-items: center; gap: 18px; }
  .marca svg { width: 64px; height: 64px; }
  .marca b { font-family: var(--fuente-titulos), sans-serif; font-size: 40px; letter-spacing: -1px; color: #fff; }
  .marca span { font-family: var(--fuente-mono), monospace; font-size: 17px; letter-spacing: 3px; text-transform: uppercase; color: #9db08a; margin-left: 4px; }
  h1 { margin-top: 70px; max-width: 640px; font-family: var(--fuente-titulos), sans-serif; font-size: 62px; line-height: 1.04; letter-spacing: -2px; color: #fff; }
  h1 em { font-style: normal; color: #c8e600; }
  p.sub { margin-top: 26px; max-width: 600px; font-size: 25px; line-height: 1.4; color: #c9d7b4; }
  .canales { position: absolute; left: 72px; bottom: 60px; display: flex; gap: 12px; }
  .canales span { padding: 9px 18px; border: 1px solid #24481a; border-radius: 999px; font-size: 19px; font-weight: 600; color: #eaf2d6; background: rgb(255 255 255 / 0.03); }
  .tarjeta { position: absolute; right: 72px; top: 150px; width: 380px; padding: 30px 32px; border-radius: 26px;
    background: #fbfcf7; color: #13280a; box-shadow: 0 40px 80px -30px rgb(0 0 0 / 0.65); transform: rotate(2.5deg); }
  .tarjeta .reloj { font-family: var(--fuente-titulos), sans-serif; font-size: 84px; font-weight: 600; letter-spacing: -4px; line-height: 1; }
  .tarjeta .fecha { margin-top: 6px; font-size: 19px; color: #586a4a; }
  .tarjeta .ok { display: flex; align-items: center; gap: 14px; margin-top: 26px; padding: 16px 18px; border-radius: 16px; background: #e7efcf; }
  .tarjeta .ok i { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #2f6e10; }
  .tarjeta .ok strong { display: block; font-size: 21px; }
  .tarjeta .ok small { font-family: var(--fuente-mono), monospace; font-size: 16px; color: #586a4a; }
  .tarjeta .fila { display: flex; justify-content: space-between; margin-top: 18px; font-size: 17px; color: #586a4a; }
  .tarjeta .fila b { font-family: var(--fuente-mono), monospace; color: #13280a; }
</style>
<div class="lienzo">
  <div class="marca">${isotipo}<b>checador</b><span>por Jemba</span></div>
  <h1>El registro de jornada de tu negocio, <em>sin&nbsp;papel.</em></h1>
  <p class="sub">Entradas, salidas y horas extra para la obligación del artículo 132, fracción XXXIV, de la LFT.</p>
  <div class="canales"><span>Celular</span><span>Kiosco</span><span>WhatsApp</span></div>
  <div class="tarjeta">
    <div class="reloj">08:02</div>
    <div class="fecha">Lunes 7 de diciembre</div>
    <div class="ok">
      <i><svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#c8e600" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></i>
      <div><strong>Entrada registrada</strong><small>Ana Pérez · 08:02</small></div>
    </div>
    <div class="fila"><span>Horas de la semana</span><b>38:15</b></div>
  </div>
</div>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// La página de entrada ya carga las tres fuentes de la app (next/font); se reemplaza su contenido.
await pagina.goto(`${APP}/entrar`);
await pagina.evaluate((h) => {
  document.body.innerHTML = h;
  document.body.style.margin = "0";
}, html);
await pagina.evaluate(() => document.fonts.ready);
await pagina.screenshot({ path: `${web}app/opengraph-image.png` });
await navegador.close();
console.log("apps/web/app/opengraph-image.png");
