// Configura Stripe para Checador (se puede correr varias veces; no duplica nada):
//   * Producto "Checador".
//   * Precios escalonados mensual y anual (lookup_key checador_mensual y checador_anual),
//     con los tramos de apps/web/lib/precios.ts. Si los tramos cambian, crea precios nuevos y
//     les pasa la lookup_key (los precios de Stripe no se pueden editar); las suscripciones
//     existentes conservan su precio hasta que se migren.
//   * Tasa de IVA 16 % (se suma al precio).
//   * Configuración del portal del cliente (tarjeta, facturas, datos fiscales y cancelación).
// Uso: STRIPE_SECRET_KEY=sk_test_... node --no-warnings scripts/stripe-configurar.mjs
//      Con una llave de producción (sk_live_) se niega, salvo con --produccion.
import { createRequire } from "node:module";
import { BASE_CENTAVOS, PERSONAS_EN_BASE, TRAMOS, MESES_PAGADOS_AL_AÑO, MAXIMO_SIN_COTIZAR } from "../apps/web/lib/precios.ts";
const Stripe = createRequire(import.meta.url)("stripe");

if (!process.env.STRIPE_SECRET_KEY) throw new Error("Falta STRIPE_SECRET_KEY.");
// Cliente con fetch: respeta un proxy de red (NODE_USE_ENV_PROXY=1), igual que en la app.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const log = (t) => console.log("✓", t);

const { livemode } = await stripe.balance.retrieve();
if (livemode && !process.argv.includes("--produccion")) throw new Error("Es una llave de producción: corre con --produccion si de verdad quieres configurar la cuenta real.");
console.log(`Cuenta de Stripe en modo ${livemode ? "PRODUCCIÓN" : "prueba"}.`);

// --- Producto ---
const productos = await stripe.products.list({ limit: 100 });
let producto = productos.data.find((p) => p.metadata.checador === "producto");
if (!producto) {
  producto = await stripe.products.create({
    name: "Checador",
    description: "Registro electrónico de jornada por persona trabajadora activa",
    metadata: { checador: "producto" },
  });
}
log(`producto ${producto.id}`);

// --- Precios escalonados (tramos de lib/precios.ts) ---
// Más de 40 personas se cotiza; si una suscripción pasa de 40, el último tramo sigue aplicando
// hasta que ventas la ajuste.
const tramos = (factor) => [
  { up_to: PERSONAS_EN_BASE, flat_amount: BASE_CENTAVOS * factor, unit_amount: 0 },
  ...TRAMOS.map((t) => ({ up_to: t.hasta, unit_amount: t.porPersonaCentavos * factor })),
  { up_to: "inf", unit_amount: TRAMOS.at(-1).porPersonaCentavos * factor },
];
const igual = (precio, esperados) =>
  precio.tiers?.length === esperados.length &&
  precio.tiers.every((t, i) => (t.up_to ?? "inf") === esperados[i].up_to && (t.flat_amount ?? 0) === (esperados[i].flat_amount ?? 0) && (t.unit_amount ?? 0) === esperados[i].unit_amount);

for (const [clave, intervalo, factor] of [["checador_mensual", "month", 1], ["checador_anual", "year", MESES_PAGADOS_AL_AÑO]]) {
  const esperados = tramos(factor);
  const { data } = await stripe.prices.list({ lookup_keys: [clave], expand: ["data.tiers"] });
  if (data[0] && igual(data[0], esperados) && data[0].active) {
    log(`precio ${clave} al día (${data[0].id})`);
    continue;
  }
  const nuevo = await stripe.prices.create({
    product: producto.id,
    currency: "mxn",
    recurring: { interval: intervalo },
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    tiers: esperados,
    tax_behavior: "exclusive",
    lookup_key: clave,
    transfer_lookup_key: true,
    nickname: intervalo === "month" ? "Checador mensual" : "Checador anual (10 meses)",
    metadata: { checador: clave, maximo_sin_cotizar: String(MAXIMO_SIN_COTIZAR) },
  });
  log(`precio ${clave} ${data[0] ? "actualizado" : "creado"} (${nuevo.id})`);
}

// --- IVA ---
const tasas = await stripe.taxRates.list({ active: true, limit: 100 });
let iva = tasas.data.find((t) => t.metadata.checador === "iva");
if (!iva) {
  iva = await stripe.taxRates.create({
    display_name: "IVA",
    description: "IVA 16 %",
    percentage: 16,
    inclusive: false,
    country: "MX",
    tax_type: "vat",
    metadata: { checador: "iva" },
  });
}
log(`IVA 16 % ${iva.id}`);

// --- Portal del cliente ---
const portal = {
  business_profile: { headline: "Checador por Jemba: tu suscripción" },
  features: {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
    subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
  },
  metadata: { checador: "portal" },
};
const configuraciones = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const existente = configuraciones.data.find((c) => c.metadata?.checador === "portal");
const configuracion = existente
  ? await stripe.billingPortal.configurations.update(existente.id, portal)
  : await stripe.billingPortal.configurations.create(portal);
log(`portal del cliente ${configuracion.id}`);
