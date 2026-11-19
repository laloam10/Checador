import { NextResponse, type NextRequest } from "next/server";
import { suscripcionValida } from "@/lib/avisos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

const extra = () => process.env.AVISOS_HOSTS_EXTRA ?? "";

/** Activa los avisos en este dispositivo (la persona debe tener sesión). */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) return NextResponse.json({ ok: false, error: "Sesión expirada." }, { status: 401 });
  const cuerpo = (await request.json().catch(() => null)) as { suscripcion?: unknown } | null;
  const s = suscripcionValida(cuerpo?.suscripcion, extra());
  if (!s) return NextResponse.json({ ok: false, error: "Este navegador no es compatible con los avisos." }, { status: 400 });
  const agente = request.headers.get("user-agent")?.slice(0, 200) ?? null;
  const { error } = await supabase.rpc("registrar_suscripcion_push", {
    p_endpoint: s.endpoint,
    p_p256dh: s.p256dh,
    p_auth: s.auth,
    p_agente: agente,
  });
  if (error) {
    const permiso = error.code === "42501";
    if (!permiso) console.error("registrar_suscripcion_push", error);
    return NextResponse.json(
      { ok: false, error: permiso ? "Solo una persona trabajadora activa puede activar avisos." : "No se pudo activar. Intenta de nuevo." },
      { status: permiso ? 403 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

/** Desactiva los avisos en este dispositivo. */
export async function DELETE(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) return NextResponse.json({ ok: false, error: "Sesión expirada." }, { status: 401 });
  const cuerpo = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof cuerpo?.endpoint !== "string" || cuerpo.endpoint.length > 1000) {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
  const { error } = await supabase.rpc("quitar_suscripcion_push", { p_endpoint: cuerpo.endpoint });
  if (error) {
    console.error("quitar_suscripcion_push", error);
    return NextResponse.json({ ok: false, error: "No se pudo desactivar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
