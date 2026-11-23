import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_BLOQUEO } from "@/lib/acceso";
import { aBytes, parteConfiable, retoDeRespuesta } from "@/lib/passkeys";
import { crearClienteServidor } from "@/lib/supabase/server";
import { clienteSinSesion } from "@/lib/supabase/servicio";

/**
 * Desbloquea con la huella o el rostro. Aquí se verifica la firma con la llave pública
 * guardada; la base solo acepta el desbloqueo con el secreto del servicio "acceso".
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.ACCESO_SECRETO_SERVICIO;
  if (!secreto) return error(503, "La huella o el rostro no están disponibles por ahora. Entra con tu PIN.");

  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = data?.claims as { sub?: string; session_id?: string } | undefined;
  if (!claims?.sub || !claims.session_id) return error(401, "Sesión expirada. Vuelve a entrar.");

  const { respuesta } = ((await request.json().catch(() => ({}))) ?? {}) as { respuesta?: AuthenticationResponseJSON };
  const reto = retoDeRespuesta(respuesta);
  if (!respuesta || !reto || typeof respuesta.id !== "string") return error(400, "Solicitud inválida.");

  const { data: pk } = await supabase
    .from("passkeys")
    .select("credencial_id, llave_publica, contador, transportes")
    .eq("user_id", claims.sub)
    .eq("credencial_id", respuesta.id)
    .maybeSingle();
  if (!pk) return error(403, "Esa huella o rostro no está registrado para tu cuenta.");

  const { rpID, origen } = parteConfiable(request.nextUrl);
  let verificacion;
  try {
    verificacion = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: reto,
      expectedOrigin: origen,
      expectedRPID: rpID,
      credential: {
        id: pk.credencial_id as string,
        publicKey: aBytes(pk.llave_publica as string),
        counter: Number(pk.contador),
        transports: (pk.transportes as string[]) ?? [],
      },
      requireUserVerification: true,
    });
  } catch {
    return error(403, "No se pudo verificar la huella o el rostro.");
  }
  if (!verificacion.verified) return error(403, "No se pudo verificar la huella o el rostro.");

  const { data: r, error: err } = await clienteSinSesion().rpc("acceso_desbloquear_passkey", {
    p_secreto: secreto,
    p_sesion: claims.session_id,
    p_user: claims.sub,
    p_credencial: pk.credencial_id,
    p_reto: reto,
    p_contador: verificacion.authenticationInfo.newCounter,
  });
  if (err) return error(500, "No se pudo desbloquear. Intenta de nuevo.");
  const resultado = r as { ok?: boolean; error?: string };
  if (!resultado?.ok) return error(403, resultado?.error ?? "No se pudo desbloquear.");

  const respuestaOk = NextResponse.json({ ok: true });
  respuestaOk.cookies.delete(COOKIE_BLOQUEO);
  return respuestaOk;
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
