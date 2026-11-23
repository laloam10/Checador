import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";
import { aBase64url, nombreDispositivo, parteConfiable, retoDeRespuesta } from "@/lib/passkeys";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/** Verifica la passkey nueva y guarda su llave pública (con la sesión desbloqueada). */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) return error(401, "Sesión expirada. Vuelve a entrar.");

  const { respuesta } = ((await request.json().catch(() => ({}))) ?? {}) as { respuesta?: RegistrationResponseJSON };
  const reto = retoDeRespuesta(respuesta);
  if (!respuesta || !reto) return error(400, "Solicitud inválida.");

  const { rpID, origen } = parteConfiable(request.nextUrl);
  let verificacion;
  try {
    verificacion = await verifyRegistrationResponse({
      response: respuesta,
      expectedChallenge: reto,
      expectedOrigin: origen,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return error(400, "No se pudo verificar la huella o el rostro. Intenta de nuevo.");
  }
  if (!verificacion.verified) return error(400, "No se pudo verificar la huella o el rostro. Intenta de nuevo.");

  const c = verificacion.registrationInfo.credential;
  const { error: err } = await supabase.rpc("registrar_passkey", {
    p_reto: reto,
    p_credencial: c.id,
    p_llave: aBase64url(c.publicKey),
    p_contador: c.counter,
    p_transportes: c.transports ?? [],
    p_nombre: nombreDispositivo(request.headers.get("user-agent")),
  });
  if (err) return error(400, err.code === "23505" ? "Esta huella o rostro ya estaba registrado." : err.message);
  return NextResponse.json({ ok: true });
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
