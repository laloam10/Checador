/**
 * Passkeys (WebAuthn): volver a entrar con la huella o el rostro del teléfono.
 * La huella nunca sale del teléfono; Checador guarda solo la llave pública
 * (migración 20261128000001_acceso_passkeys.sql).
 */

/** El dominio de la passkey es el de la página: una passkey de pruebas no sirve en producción. */
export function parteConfiable(url: URL): { rpID: string; origen: string } {
  return { rpID: url.hostname, origen: url.origin };
}

/** Reto que firmó el teléfono (viene dentro de clientDataJSON, en base64url). */
export function retoDeRespuesta(respuesta: unknown): string | null {
  const datos = (respuesta as { response?: { clientDataJSON?: unknown } } | null)?.response?.clientDataJSON;
  if (typeof datos !== "string" || datos.length > 4096) return null;
  try {
    const reto = (JSON.parse(Buffer.from(datos, "base64url").toString("utf8")) as { challenge?: unknown }).challenge;
    return typeof reto === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(reto) ? reto : null;
  } catch {
    return null;
  }
}

/** Nombre legible del dispositivo para la lista de passkeys. */
export function nombreDispositivo(agente: string | null): string {
  const a = agente ?? "";
  if (/iPhone/.test(a)) return "iPhone";
  if (/iPad/.test(a)) return "iPad";
  if (/Android/.test(a)) return "Teléfono Android";
  if (/Macintosh/.test(a)) return "Mac";
  if (/Windows/.test(a)) return "Computadora con Windows";
  return "Este dispositivo";
}

export const aBytes = (b64url: string) => new Uint8Array(Buffer.from(b64url, "base64url"));
export const aBase64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/** Los 16 bytes del UUID del usuario (WebAuthn no debe recibir el correo como identificador). */
export const bytesDeUuid = (uuid: string) => new Uint8Array(Buffer.from(uuid.replace(/-/g, ""), "hex"));
