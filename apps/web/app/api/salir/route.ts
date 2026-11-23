import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_BLOQUEO, OPCIONES_COOKIE_BLOQUEO } from "@/lib/acceso";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Salir. Si la persona eligió volver a entrar con su PIN, se bloquea la sesión de este
 * teléfono (no se cierra) y responde { bloqueada: true }. Con ?completa=1, o si eligió el
 * código por correo, se cierra la sesión y la próxima vez se pide el código.
 */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const completa = request.nextUrl.searchParams.get("completa") === "1";

  if (!completa) {
    const { data: claims } = await supabase.auth.getClaims().catch(() => ({ data: null }));
    const sesion = (claims?.claims as { session_id?: string } | undefined)?.session_id;
    const { data: bloqueada, error } = await supabase.rpc("bloquear_mi_sesion");
    if (!error && bloqueada === true && sesion) {
      const r = NextResponse.json({ ok: true, bloqueada: true });
      r.cookies.set(COOKIE_BLOQUEO, sesion, { ...OPCIONES_COOKIE_BLOQUEO, secure: request.nextUrl.protocol === "https:" });
      return r;
    }
  } else {
    await supabase.rpc("olvidar_bloqueo_de_mi_sesion");
  }

  await supabase.auth.signOut();
  const r = NextResponse.json({ ok: true, bloqueada: false });
  r.cookies.delete(COOKIE_BLOQUEO);
  return r;
}
