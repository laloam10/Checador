import { NextResponse, type NextRequest } from "next/server";
import { resumenConformidad } from "@/lib/datos";
import { evidenciaDe } from "@/lib/evidencia";
import { esLunes, estadoHttp, semanaEnKiosco, validarCredenciales, type RespuestaKiosco } from "@/lib/kiosco";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/**
 * Conformidad u objeción de una semana desde el kiosco, firmada con número y PIN
 * (prueba plena, art. 132 XXXIV). Como en la app del celular, el resumen se recalcula
 * aquí: se guarda exactamente lo que se mostró, no lo que envíe el dispositivo.
 */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) {
    return NextResponse.json({ ok: false, error: "Sesión del kiosco expirada." }, { status: 401 });
  }
  const { numero, pin, lunes, respuesta, comentario } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const invalido = validarCredenciales(numero, pin);
  if (invalido) return NextResponse.json({ ok: false, error: invalido }, { status: 400 });
  if (!esLunes(lunes)) return NextResponse.json({ ok: false, error: "Semana inválida." }, { status: 400 });
  if (respuesta !== "conforme" && respuesta !== "objeta") {
    return NextResponse.json({ ok: false, error: "Respuesta inválida." }, { status: 400 });
  }
  const texto = typeof comentario === "string" ? comentario.trim().slice(0, 2000) : "";
  if (respuesta === "objeta" && !texto) {
    return NextResponse.json({ ok: false, error: "Explica qué registro no es correcto." }, { status: 400 });
  }

  try {
    const { r, calculo } = await semanaEnKiosco(supabase, numero as string, pin as string, lunes);
    if (!r.ok || !calculo) return NextResponse.json({ ok: false, error: r.error }, { status: estadoHttp(r) });

    const { data, error } = await supabase.rpc("kiosco_conformidad", {
      p_numero: numero,
      p_pin: pin,
      p_lunes: lunes,
      p_respuesta: respuesta,
      p_comentario: texto || null,
      p_resumen: resumenConformidad(lunes, calculo),
      p_evidencia: evidenciaDe(request),
    });
    if (error) throw error;
    const c = data as RespuestaKiosco & { cadena_secuencia?: number; cadena_hash?: string };
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: estadoHttp(c) });
    return NextResponse.json({ ok: true, comprobante: { cadena_secuencia: c.cadena_secuencia, cadena_hash: c.cadena_hash } });
  } catch (e) {
    console.error("kiosco_conformidad", e);
    return NextResponse.json({ ok: false, error: "No se pudo registrar tu respuesta." }, { status: 500 });
  }
}
