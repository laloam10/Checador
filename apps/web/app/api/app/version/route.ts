import { NextResponse } from "next/server";

/**
 * Versión mínima de la app instalada que el servidor acepta. Si la app es más vieja, debe
 * pedir que se actualice antes de checar (cada versión en tiendas pasa revisión y en los
 * teléfonos conviven versiones distintas). Se configura con APP_VERSION_MINIMA ("x.y.z").
 */
export function GET() {
  const minima = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(process.env.APP_VERSION_MINIMA ?? "") ? process.env.APP_VERSION_MINIMA! : "0.0.0";
  return NextResponse.json({ minima, horaServidor: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
