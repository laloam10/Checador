import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";
import { aBytes, bytesDeUuid, parteConfiable } from "@/lib/passkeys";
import { crearClienteServidor } from "@/lib/supabase/server";

/** Opciones para registrar una passkey o para desbloquear con ella. El reto lo emite la base. */
export async function POST(request: NextRequest) {
  const { tipo } = ((await request.json().catch(() => ({}))) ?? {}) as { tipo?: unknown };
  if (tipo !== "registro" && tipo !== "desbloqueo") return error(400, "Solicitud inválida.");

  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub) return error(401, "Sesión expirada. Vuelve a entrar.");

  const { data: reto, error: errReto } = await supabase.rpc("crear_reto_acceso", { p_tipo: tipo });
  if (errReto || typeof reto !== "string") return error(403, "No se puede hacer eso ahora.");
  const { data: lista } = await supabase.from("passkeys").select("credencial_id, transportes").eq("user_id", claims.sub);
  const credenciales = (lista ?? []).map((p) => ({ id: p.credencial_id as string, transports: (p.transportes as string[]) ?? [] }));
  const { rpID } = parteConfiable(request.nextUrl);

  if (tipo === "registro") {
    return NextResponse.json(
      await generateRegistrationOptions({
        rpName: "Checador",
        rpID,
        userName: claims.email ?? claims.sub,
        userDisplayName: claims.email ?? "",
        userID: bytesDeUuid(claims.sub),
        challenge: aBytes(reto),
        attestationType: "none",
        excludeCredentials: credenciales,
        // La del propio teléfono (huella, rostro o bloqueo de pantalla), no una llave externa.
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
      }),
    );
  }
  if (!credenciales.length) return error(409, "No tienes huella o rostro registrado.");
  return NextResponse.json(
    await generateAuthenticationOptions({ rpID, allowCredentials: credenciales, userVerification: "required", challenge: aBytes(reto) }),
  );
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
