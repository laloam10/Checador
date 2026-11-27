"use server";

import { redirect } from "next/navigation";
import { configCobro, crearSesionPago, crearSesionPortal, type Ciclo } from "@/lib/cobro";
import { esGestor, requierePanel } from "@/lib/panel";

export type EstadoCobro = { mensaje: string } | null;

/** Contratar: lleva a la página de pago de Stripe (tarjeta, RFC y dirección fiscal). */
export async function contratar(_: EstadoCobro, fd: FormData): Promise<EstadoCobro> {
  const ctx = await requierePanel();
  if (!esGestor(ctx.rol)) return { mensaje: "Solo el propietario o un administrador pueden contratar." };
  if (!configCobro()) return { mensaje: "El pago en línea aún no está disponible." };
  const ciclo: Ciclo = fd.get("ciclo") === "anual" ? "anual" : "mensual";
  let url: string;
  try {
    url = await crearSesionPago(ctx, ciclo);
  } catch (e) {
    console.error("No se pudo abrir el pago de Stripe", e);
    return { mensaje: "No se pudo abrir la página de pago. Intenta de nuevo en unos minutos." };
  }
  redirect(url);
}

/** Administrar la forma de pago, ver facturas o cancelar (portal del cliente de Stripe). */
export async function administrarPago(_: EstadoCobro): Promise<EstadoCobro> {
  const ctx = await requierePanel();
  if (!esGestor(ctx.rol)) return { mensaje: "Solo el propietario o un administrador pueden administrar el pago." };
  let url: string;
  try {
    url = await crearSesionPortal(ctx);
  } catch (e) {
    console.error("No se pudo abrir el portal de Stripe", e);
    return { mensaje: "No se pudo abrir el portal de pago. Intenta de nuevo en unos minutos." };
  }
  redirect(url);
}
