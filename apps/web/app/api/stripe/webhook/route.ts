import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { configCobro, registrarSuscripcion, stripe } from "@/lib/cobro";

/**
 * Avisos de Stripe (docs/cobro.md, fase 2). Solo se aceptan con la firma de Stripe
 * (STRIPE_WEBHOOK_SECRET). Con cada aviso de la suscripción se vuelve a leer su estado en
 * Stripe y se guarda con el secreto del servicio "cobro".
 * Eventos que hay que activar en Stripe: checkout.session.completed y
 * customer.subscription.created / updated / deleted.
 */
export async function POST(request: NextRequest) {
  const c = configCobro();
  if (!c?.secretoAvisos) return NextResponse.json({ ok: false, error: "Cobro sin configurar" }, { status: 503 });

  const cuerpo = await request.text();
  let evento: Stripe.Event;
  try {
    evento = await stripe().webhooks.constructEventAsync(cuerpo, request.headers.get("stripe-signature") ?? "", c.secretoAvisos);
  } catch {
    return NextResponse.json({ ok: false, error: "Firma inválida" }, { status: 400 });
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        const sesion = evento.data.object;
        if (sesion.mode === "subscription" && sesion.subscription) {
          await registrarSuscripcion(typeof sesion.subscription === "string" ? sesion.subscription : sesion.subscription.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await registrarSuscripcion(evento.data.object.id);
        break;
    }
  } catch (e) {
    // Stripe reintenta los avisos que no reciben 2xx.
    console.error("Error al procesar el aviso de Stripe", evento.type, e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
