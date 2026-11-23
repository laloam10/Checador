import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_BLOQUEO, RE_PIN } from "@/lib/acceso";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/** Desbloquea la sesión de este teléfono con el PIN (el límite de intentos está en la base). */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) return error(401, "Sesión expirada. Vuelve a entrar.");

  const { pin } = ((await request.json().catch(() => ({}))) ?? {}) as { pin?: unknown };
  if (typeof pin !== "string" || !RE_PIN.test(pin)) return error(400, "El PIN tiene de 4 a 6 dígitos.");

  const { data, error: err } = await supabase.rpc("desbloquear_con_pin", { p_pin: pin });
  if (err) return error(500, "No se pudo verificar el PIN. Intenta de nuevo.");
  const r = data as { ok?: boolean; error?: string };
  if (!r?.ok) return error(403, r?.error ?? "PIN incorrecto.");

  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.delete(COOKIE_BLOQUEO);
  return respuesta;
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
