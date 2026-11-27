import "server-only";

import Stripe from "stripe";
import { headers } from "next/headers";
import { clienteSinSesion } from "./supabase/servicio";
import type { crearClienteServidor } from "./supabase/server";

/**
 * Cobro con Stripe (fase 2 de docs/cobro.md). El precio escalonado vive en Stripe con la
 * lookup_key checador_mensual / checador_anual (scripts/stripe-configurar.mjs lo crea con los
 * tramos de lib/precios.ts). La suscripción de la empresa se guarda en la base solo con el
 * secreto del servicio "cobro"; nunca con la llave service_role.
 */
type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;
export type Ciclo = "mensual" | "anual";
type EstadoSuscripcion = "prueba" | "activa" | "pago_vencido" | "cancelada";

interface ConfigCobro {
  llave: string;
  secretoAvisos: string | null;
  secretoServicio: string;
}

/** Configuración del cobro; null si falta algo (el panel dice que el pago llega pronto). */
export function configCobro(): ConfigCobro | null {
  const llave = process.env.STRIPE_SECRET_KEY;
  const secretoServicio = process.env.COBRO_SECRETO_SERVICIO;
  if (!llave || !secretoServicio) return null;
  return { llave, secretoServicio, secretoAvisos: process.env.STRIPE_WEBHOOK_SECRET || null };
}

let instancia: Stripe | null = null;
export function stripe(): Stripe {
  const c = configCobro();
  if (!c) throw new Error("Cobro sin configurar");
  // Cliente con fetch: funciona igual en Vercel y detrás de un proxy (NODE_USE_ENV_PROXY=1).
  instancia ??= new Stripe(c.llave, { httpClient: Stripe.createFetchHttpClient(), appInfo: { name: "Checador" } });
  return instancia;
}

// Precios, IVA y portal: se buscan una vez por proceso.
const cache = new Map<string, Promise<string>>();
const unaVez = (clave: string, buscar: () => Promise<string>) => {
  if (!cache.has(clave)) cache.set(clave, buscar().catch((e) => { cache.delete(clave); throw e; }));
  return cache.get(clave)!;
};
const precioDe = (ciclo: Ciclo) =>
  unaVez(`precio:${ciclo}`, async () => {
    const { data } = await stripe().prices.list({ lookup_keys: [`checador_${ciclo}`], active: true });
    if (!data[0]) throw new Error(`Falta el precio checador_${ciclo}: corre scripts/stripe-configurar.mjs`);
    return data[0].id;
  });
const tasaIva = () =>
  unaVez("iva", async () => {
    const { data } = await stripe().taxRates.list({ active: true, limit: 100 });
    const iva = data.find((t) => t.metadata?.checador === "iva");
    if (!iva) throw new Error("Falta la tasa de IVA: corre scripts/stripe-configurar.mjs");
    return iva.id;
  });
const configuracionPortal = () =>
  unaVez("portal", async () => {
    const { data } = await stripe().billingPortal.configurations.list({ active: true, limit: 100 });
    const portal = data.find((c) => c.metadata?.checador === "portal");
    if (!portal) throw new Error("Falta la configuración del portal: corre scripts/stripe-configurar.mjs");
    return portal.id;
  });

/** Dirección de la app en este mismo dominio (pruebas o producción), para volver de Stripe. */
async function origen() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "checador.jemba.mx";
  const protocolo = h.get("x-forwarded-proto") ?? (/^(127\.|localhost)/.test(host) ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** Personas trabajadoras activas (sin baja): lo único que se cobra. */
export async function personasActivas(supabase: Cliente, empresaId: string): Promise<number> {
  const { count, error } = await supabase.from("trabajadores").select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId).is("fecha_baja", null);
  if (error) throw error;
  return count ?? 0;
}

interface Contexto {
  supabase: Cliente;
  empresa: { id: string; razonSocial: string };
}

interface FilaSuscripcion {
  estado: EstadoSuscripcion;
  prueba_hasta: string;
  cliente_externo: string | null;
  suscripcion_externa: string | null;
}

async function suscripcionDe(ctx: Contexto): Promise<FilaSuscripcion> {
  const { data, error } = await ctx.supabase.from("suscripciones")
    .select("estado, prueba_hasta, cliente_externo, suscripcion_externa").eq("empresa_id", ctx.empresa.id).single<FilaSuscripcion>();
  if (error || !data) throw new Error("Suscripción no encontrada");
  return data;
}

/** Cliente de Stripe de la empresa; lo crea la primera vez y lo deja ligado en la base. */
async function clienteStripe(ctx: Contexto, fila: FilaSuscripcion): Promise<string> {
  if (fila.cliente_externo) return fila.cliente_externo;
  const { data: claims } = await ctx.supabase.auth.getClaims();
  const correo = typeof claims?.claims?.email === "string" ? claims.claims.email : undefined;
  const cliente = await stripe().customers.create({
    name: ctx.empresa.razonSocial,
    email: correo,
    preferred_locales: ["es-419"],
    metadata: { empresa_id: ctx.empresa.id },
  });
  const { data: ligado, error } = await ctx.supabase.rpc("cobro_vincular_cliente", {
    p_secreto: configCobro()!.secretoServicio, p_empresa: ctx.empresa.id, p_cliente: cliente.id,
  });
  if (error) throw error;
  if (!ligado) return (await suscripcionDe(ctx)).cliente_externo!; // otra pestaña ganó la carrera
  return cliente.id;
}

/**
 * Sesión de pago de Stripe para contratar. Si la empresa sigue en prueba, el primer cobro
 * llega hasta que termina (Stripe pide al menos 48 h de prueba restante; con menos, cobra ya).
 */
export async function crearSesionPago(ctx: Contexto, ciclo: Ciclo): Promise<string> {
  const fila = await suscripcionDe(ctx);
  if (fila.suscripcion_externa && fila.estado !== "cancelada") return crearSesionPortal(ctx);
  const [cliente, precio, iva, personas, base] = await Promise.all([
    clienteStripe(ctx, fila), precioDe(ciclo), tasaIva(), personasActivas(ctx.supabase, ctx.empresa.id), origen(),
  ]);
  const finPrueba = Math.floor(Date.parse(fila.prueba_hasta) / 1000);
  const conPrueba = fila.estado === "prueba" && finPrueba - Date.now() / 1000 > 48 * 3600 + 600;
  const sesion = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: cliente,
    line_items: [{ price: precio, quantity: Math.max(1, personas) }],
    subscription_data: {
      metadata: { empresa_id: ctx.empresa.id },
      default_tax_rates: [iva],
      ...(conPrueba ? { trial_end: finPrueba } : {}),
    },
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    payment_method_collection: "always",
    locale: "es-419",
    metadata: { empresa_id: ctx.empresa.id },
    success_url: `${base}/panel/configuracion?pago=listo#suscripcion`,
    cancel_url: `${base}/panel/configuracion?pago=cancelado#suscripcion`,
  });
  if (!sesion.url) throw new Error("Stripe no devolvió la página de pago");
  return sesion.url;
}

/** Portal del cliente de Stripe: tarjeta, facturas, datos fiscales y cancelación. */
export async function crearSesionPortal(ctx: Contexto): Promise<string> {
  const fila = await suscripcionDe(ctx);
  if (!fila.cliente_externo) throw new Error("La empresa aún no tiene forma de pago");
  const sesion = await stripe().billingPortal.sessions.create({
    customer: fila.cliente_externo,
    configuration: await configuracionPortal(),
    locale: "es-419",
    return_url: `${await origen()}/panel/configuracion#suscripcion`,
  });
  return sesion.url;
}

/**
 * Ajusta en Stripe cuántas personas se cobran (con prorrateo) después de un alta o una baja.
 * Nunca hace fallar el alta o la baja: si Stripe no responde, se registra en el log y el
 * siguiente ajuste lo corrige.
 */
export async function sincronizarPersonas(ctx: Contexto): Promise<void> {
  if (!configCobro()) return;
  try {
    const fila = await suscripcionDe(ctx);
    if (!fila.suscripcion_externa || fila.estado === "cancelada") return;
    const personas = Math.max(1, await personasActivas(ctx.supabase, ctx.empresa.id));
    const sub = await stripe().subscriptions.retrieve(fila.suscripcion_externa);
    const item = sub.items.data[0];
    if (!item || item.quantity === personas || sub.status === "canceled") return;
    await stripe().subscriptionItems.update(item.id, { quantity: personas, proration_behavior: "create_prorations" });
  } catch (e) {
    console.error("No se pudo ajustar la cantidad de personas en Stripe", e);
  }
}

/** Estado de Checador según el estado de la suscripción en Stripe. */
export function estadoDeStripe(estado: Stripe.Subscription.Status): EstadoSuscripcion {
  switch (estado) {
    case "active": return "activa";
    case "past_due": case "unpaid": case "paused": return "pago_vencido";
    case "canceled": return "cancelada";
    default: return "prueba"; // trialing; incomplete (aún no se cobra el primer pago)
  }
}

/**
 * Guarda en la base el estado de una suscripción de Stripe. Siempre la vuelve a leer de Stripe:
 * si los avisos llegan en desorden, nunca se guarda un estado viejo.
 */
export async function registrarSuscripcion(idSuscripcion: string): Promise<boolean> {
  const sub = await stripe().subscriptions.retrieve(idSuscripcion);
  const empresa = sub.metadata?.empresa_id;
  const item = sub.items.data[0];
  if (!empresa || !item) {
    console.error("Suscripción de Stripe sin empresa", sub.id);
    return false;
  }
  const { data, error } = await clienteSinSesion().rpc("cobro_actualizar", {
    p_secreto: configCobro()!.secretoServicio,
    p_empresa: empresa,
    p_estado: estadoDeStripe(sub.status),
    p_periodo_fin: new Date(item.current_period_end * 1000).toISOString(),
    p_ciclo: item.price.recurring?.interval === "year" ? "anual" : "mensual",
    p_cliente: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    p_suscripcion: sub.id,
    p_personas: item.quantity ?? 0,
  });
  if (error) throw error;
  return Boolean(data);
}
