import { NextResponse } from "next/server";

/** Hora del servidor, para calcular el desfase del reloj del dispositivo. */
export function GET() {
  return NextResponse.json(
    { horaServidor: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
