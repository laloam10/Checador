// Prueba de punta a punta del cobro con Stripe en MODO DE PRUEBA (docs/cobro.md, fase 2).
// Una empresa nueva contrata, Stripe avisa, las altas y bajas ajustan la cantidad, la prueba
// termina y se cobra, y al final cancela. Las páginas de Stripe (pago y portal) no se abren: se
// comprueba que la app lleve a ellas. El pago completado se simula creando la suscripción por
// la API con una tarjeta de prueba, y los avisos se envían firmados con el mismo secreto de la app.
// Uso: STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... node apps/web/e2e/cobro.e2e.mjs
//      (la app debe correr con las mismas variables y COBRO_SECRETO_SERVICIO; ver docs/publicacion.md §1.13)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const Stripe = require("stripe");

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sufijo = Date.now().toString(36);
const DUENO = `dueno.cobro.${sufijo}@ejemplo.mx`;
const EMPRESA = `Cafetería El Cobro ${sufijo}`;
const paso = (t) => console.log(`✓ ${t}`);
const sql = (q) => execFileSync("psql", [DB_URL, "-XtAc", q], { encoding: "utf8" }).trim();

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
  console.error("Faltan STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET (los mismos con que corre la app).");
  process.exit(2);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
if ((await stripe.balance.retrieve()).livemode) throw new Error("Esta prueba solo corre con una llave de MODO DE PRUEBA de Stripe.");

async function entrar(page, correo, destino) {
  await page.goto(`${APP}${destino}`);
  await page.waitForURL(/\/entrar/);
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

/** Envía a la app un aviso de Stripe firmado (la app vuelve a leer la suscripción en Stripe). */
async function aviso(tipo, objeto, secreto = process.env.STRIPE_WEBHOOK_SECRET) {
  const cuerpo = JSON.stringify({ id: `evt_prueba_${Date.now()}`, object: "event", type: tipo, data: { object: objeto } });
  const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto });
  return fetch(`${APP}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": firma }, body: cuerpo });
}
const fila = () => {
  const [estado, cliente, sub, personas, periodo, ciclo] = sql(`select estado, coalesce(cliente_externo, ''), coalesce(suscripcion_externa, ''), coalesce(personas_cobradas, -1),
      coalesce(extract(epoch from periodo_fin)::bigint, 0), ciclo
    from suscripciones s join empresas e on e.id = s.empresa_id where e.razon_social = '${EMPRESA}'`).split("|");
  return { estado, cliente, sub, personas: Number(personas), periodo: Number(periodo), ciclo };
};
const esperar = async (cond, descr) => {
  for (let i = 0; i < 40; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`No se cumplió: ${descr}`);
};

const browser = await chromium.launch();
const dueno = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-MX" })).newPage();
// Las páginas de Stripe no se abren: se registra a dónde lleva la app.
const visitas = [];
await dueno.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, (r) => { visitas.push(r.request().url()); r.fulfill({ status: 200, body: "Stripe" }); });
let suscripcion = null;

try {
  // 1. Empresa nueva con 3 personas
  await entrar(dueno, DUENO, "/panel");
  await dueno.waitForURL(`${APP}/alta-empresa`);
  await dueno.getByLabel("Razón social o nombre del negocio").fill(EMPRESA);
  await dueno.getByLabel("Sí, puede salir").check();
  await dueno.getByRole("button", { name: "Crear empresa" }).click();
  await dueno.waitForURL(`${APP}/panel`);
  const alta = async (nombre, numero) => {
    await dueno.goto(`${APP}/panel/trabajadores`);
    await dueno.getByLabel("Nombre completo").fill(nombre);
    await dueno.getByLabel("Número de empleado").fill(numero);
    await dueno.getByLabel("Fecha de ingreso").fill("2026-01-10");
    await dueno.getByRole("button", { name: "Dar de alta" }).click();
    await dueno.getByRole("heading", { name: nombre }).waitFor();
  };
  for (const [n, num] of [["Ana Cobro", "201"], ["Beto Cobro", "202"], ["Caro Cobro", "203"]]) await alta(n, num);
  paso("empresa nueva con 3 personas activas");

  // 2. Contratar: crea el cliente de Stripe y lleva a la página de pago con la prueba
  await dueno.goto(`${APP}/panel/configuracion#suscripcion`);
  await dueno.getByText("$249 al mes + IVA").first().waitFor();
  await dueno.getByRole("button", { name: "Agregar tarjeta" }).click();
  await esperar(() => visitas.some((u) => u.startsWith("https://checkout.stripe.com/")), "ir a la página de pago de Stripe");
  const { cliente } = fila();
  if (!/^cus_/.test(cliente)) throw new Error("No se ligó el cliente de Stripe");
  const [sesion] = (await stripe.checkout.sessions.list({ customer: cliente, limit: 1 })).data;
  const conceptos = await stripe.checkout.sessions.listLineItems(sesion.id);
  if (conceptos.data[0].quantity !== 3 || conceptos.data[0].price.lookup_key !== "checador_mensual") throw new Error("La sesión de pago no cobra 3 personas al mes");
  if (sesion.metadata.empresa_id !== sql(`select id from empresas where razon_social = '${EMPRESA}'`)) throw new Error("La sesión no lleva la empresa");
  paso("contratar crea el cliente de Stripe y lleva al pago: 3 personas, precio mensual escalonado");

  // 3. Pago completado (simulado) y aviso firmado
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: cliente });
  await stripe.customers.update(cliente, { invoice_settings: { default_payment_method: pm.id } });
  const [precio] = (await stripe.prices.list({ lookup_keys: ["checador_mensual"] })).data;
  const iva = (await stripe.taxRates.list({ active: true, limit: 100 })).data.find((t) => t.metadata.checador === "iva");
  const finPrueba = Number(sql(`select extract(epoch from prueba_hasta)::bigint from suscripciones s join empresas e on e.id = s.empresa_id where e.razon_social = '${EMPRESA}'`));
  suscripcion = await stripe.subscriptions.create({
    customer: cliente, items: [{ price: precio.id, quantity: 3 }], trial_end: finPrueba,
    default_tax_rates: [iva.id], metadata: { empresa_id: sesion.metadata.empresa_id },
  });
  if ((await aviso("customer.subscription.created", { id: "sub_falsa" }, "whsec_otro_secreto")).status !== 400) throw new Error("Aceptó un aviso con firma falsa");
  const r = await aviso("customer.subscription.created", { id: suscripcion.id });
  if (r.status !== 200) throw new Error(`El aviso firmado respondió ${r.status}`);
  let f = fila();
  if (f.estado !== "prueba" || f.sub !== suscripcion.id || f.personas !== 3 || Math.abs(f.periodo - finPrueba) > 5) throw new Error(`Suscripción mal registrada: ${JSON.stringify(f)}`);
  paso("un aviso con firma falsa se rechaza; el aviso firmado registra la suscripción en prueba hasta el fin de la prueba");

  await dueno.goto(`${APP}/panel/configuracion?pago=listo#suscripcion`);
  await dueno.getByText("Listo: registramos tu forma de pago").waitFor();
  await dueno.getByText(/Tarjeta registrada: el primer cobro será el/).waitFor();
  await dueno.getByRole("button", { name: "Administrar pago y facturas" }).click();
  await esperar(() => visitas.some((u) => u.startsWith("https://billing.stripe.com/")), "ir al portal de Stripe");
  paso("el panel muestra la tarjeta registrada y lleva al portal de Stripe");

  // 4. Altas y bajas ajustan la cantidad en Stripe
  await alta("Dani Cobro", "204");
  await esperar(async () => (await stripe.subscriptions.retrieve(suscripcion.id)).items.data[0].quantity === 4, "4 personas en Stripe tras el alta");
  await dueno.getByLabel("Escribe BAJA para confirmar").fill("BAJA");
  await dueno.getByRole("button", { name: "Registrar baja" }).click();
  await dueno.getByText(/Dado de baja el/).waitFor();
  await esperar(async () => (await stripe.subscriptions.retrieve(suscripcion.id)).items.data[0].quantity === 3, "3 personas en Stripe tras la baja");
  paso("un alta y una baja ajustan la cantidad de personas en Stripe");

  // 5. Termina la prueba: se cobra con la tarjeta y queda activa
  await stripe.subscriptions.update(suscripcion.id, { trial_end: "now", proration_behavior: "none" });
  await aviso("customer.subscription.updated", { id: suscripcion.id });
  f = fila();
  if (f.estado !== "activa" || f.periodo < Date.now() / 1000 + 27 * 86400) throw new Error(`Debía quedar activa por un mes: ${JSON.stringify(f)}`);
  const [factura] = (await stripe.invoices.list({ subscription: suscripcion.id, limit: 1 })).data;
  if (factura.subtotal !== 24900 || factura.total !== 28884) throw new Error(`Cobro inesperado: ${factura.subtotal} + IVA = ${factura.total}`);
  await dueno.goto(`${APP}/panel/configuracion#suscripcion`);
  await dueno.locator(".chip-estado", { hasText: "Activa" }).waitFor();
  await dueno.getByText(/Próximo cobro:/).waitFor();
  paso("al terminar la prueba se cobran $249 + IVA = $288.84 y la suscripción queda activa");

  // 6. Cancelación
  await stripe.subscriptions.cancel(suscripcion.id);
  await aviso("customer.subscription.deleted", { id: suscripcion.id });
  if (fila().estado !== "cancelada") throw new Error("Debía quedar cancelada");
  await dueno.reload();
  await dueno.locator(".chip-estado", { hasText: "Cancelada" }).waitFor();
  await dueno.getByRole("button", { name: "Contratar" }).waitFor();
  paso("al cancelar, la suscripción queda cancelada y se puede volver a contratar");

  console.log("\nPrueba de cobro: OK");
} catch (e) {
  console.error("\nFALLÓ:", e.message);
  await dueno.screenshot({ path: "e2e-fallo.png", fullPage: true }).catch(() => {});
  if (suscripcion) await stripe.subscriptions.cancel(suscripcion.id).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
