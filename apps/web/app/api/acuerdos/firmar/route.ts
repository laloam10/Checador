import { NextResponse, type NextRequest } from "next/server";
import { evidenciaDe } from "@/lib/evidencia";
import { misTrabajadores } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/** Firma electrónica del acuerdo por la persona trabajadora (su cuenta, verificada por correo). */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) return NextResponse.json({ ok: false, error: "Sesión expirada. Vuelve a entrar." }, { status: 401 });

  const { acuerdoId, acepto } = (await request.json().catch(() => ({}))) as { acuerdoId?: unknown; acepto?: unknown };
  if (acepto !== true) return NextResponse.json({ ok: false, error: "Debes confirmar que leíste y aceptas el acuerdo." }, { status: 400 });

  const trabajador = (await misTrabajadores(supabase, userId))[0];
  if (!trabajador) return NextResponse.json({ ok: false, error: "No tienes un registro de trabajador activo." }, { status: 403 });

  const { data: pendiente } = await supabase.rpc("acuerdo_pendiente", { p_trabajador: trabajador.id }).maybeSingle<{ id: string }>();
  if (!pendiente || pendiente.id !== acuerdoId) {
    return NextResponse.json({ ok: false, error: "Ese acuerdo ya no está pendiente de firma. Recarga la página." }, { status: 409 });
  }

  const { error } = await supabase.from("firmas_acuerdo").insert({
    empresa_id: trabajador.empresaId,
    acuerdo_id: pendiente.id,
    firmante: "trabajador",
    modalidad: "electronica",
    evidencia: { ...evidenciaDe(request), aceptacion: "Leí el acuerdo completo y estoy de acuerdo" },
  });
  if (error) {
    console.error("Firma de acuerdo", error);
    return NextResponse.json({ ok: false, error: "No se pudo registrar tu firma. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
