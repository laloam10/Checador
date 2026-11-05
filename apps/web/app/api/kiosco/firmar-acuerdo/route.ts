import { NextResponse, type NextRequest } from "next/server";
import { evidenciaDe } from "@/lib/evidencia";
import { estadoHttp, validarCredenciales, type RespuestaKiosco } from "@/lib/kiosco";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/** La persona trabajadora firma su acuerdo pendiente en el kiosco con número de empleado y PIN. */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) {
    return NextResponse.json({ ok: false, error: "Sesión del kiosco expirada." }, { status: 401 });
  }
  const { numero, pin, acuerdoId, acepto } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const invalido = validarCredenciales(numero, pin);
  if (invalido) return NextResponse.json({ ok: false, error: invalido }, { status: 400 });
  if (acepto !== true || typeof acuerdoId !== "string") {
    return NextResponse.json({ ok: false, error: "Debes confirmar que leíste y aceptas el acuerdo." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("kiosco_firmar_acuerdo", {
    p_numero: numero,
    p_pin: pin,
    p_acuerdo: acuerdoId,
    p_evidencia: { ...evidenciaDe(request), aceptacion: "Leí el acuerdo completo y estoy de acuerdo" },
  });
  if (error) {
    console.error("kiosco_firmar_acuerdo", error);
    return NextResponse.json({ ok: false, error: "No se pudo registrar la firma." }, { status: 500 });
  }
  const r = data as RespuestaKiosco & { version?: number; folio?: string };
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: estadoHttp(r) });
  return NextResponse.json({ ok: true, nombre: r.nombre, version: r.version, folio: r.folio });
}
