import { NextResponse, type NextRequest } from "next/server";
import { esLunes, estadoHttp, semanaEnKiosco, validarCredenciales } from "@/lib/kiosco";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/**
 * Una semana pendiente de revisar, calculada con el motor, para quien se identificó con
 * número y PIN. Solo semanas pendientes: el kiosco es un dispositivo compartido.
 */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) {
    return NextResponse.json({ ok: false, error: "Sesión del kiosco expirada." }, { status: 401 });
  }
  const { numero, pin, lunes } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const invalido = validarCredenciales(numero, pin);
  if (invalido) return NextResponse.json({ ok: false, error: invalido }, { status: 400 });
  if (!esLunes(lunes)) return NextResponse.json({ ok: false, error: "Semana inválida." }, { status: 400 });

  try {
    const { r, calculo } = await semanaEnKiosco(supabase, numero as string, pin as string, lunes);
    if (!r.ok || !calculo) return NextResponse.json({ ok: false, error: r.error }, { status: estadoHttp(r) });
    return NextResponse.json({ ok: true, lunes, semana: calculo.semana, reconstruccion: calculo.reconstruccion });
  } catch (e) {
    console.error("kiosco_semana", e);
    return NextResponse.json({ ok: false, error: "No se pudo cargar la semana." }, { status: 500 });
  }
}
