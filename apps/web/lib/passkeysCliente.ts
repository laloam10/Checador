"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

type Resultado = { ok: true } | { ok: false; error: string };

async function pedirOpciones(tipo: "registro" | "desbloqueo") {
  const r = await fetch("/api/acceso/passkey/opciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo }),
  });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((c as { error?: string }).error ?? "No se pudo iniciar.");
  return c;
}

function mensajeDe(e: unknown): string {
  const nombre = (e as { name?: string })?.name;
  if (nombre === "NotAllowedError" || nombre === "AbortError") return "Se canceló o el teléfono no lo permitió.";
  if (nombre === "InvalidStateError") return "Este teléfono ya estaba registrado.";
  return e instanceof Error && e.message ? e.message : "No se pudo completar. Intenta de nuevo.";
}

async function enviar(ruta: string, respuesta: unknown): Promise<Resultado> {
  const r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ respuesta }) });
  const c = (await r.json().catch(() => ({}))) as { error?: string };
  return r.ok ? { ok: true } : { ok: false, error: c.error ?? "No se pudo completar." };
}

/** Registra la huella o el rostro de este teléfono (passkey). */
export async function registrarPasskey(): Promise<Resultado> {
  try {
    const respuesta = await startRegistration({ optionsJSON: await pedirOpciones("registro") });
    return await enviar("/api/acceso/passkey/registrar", respuesta);
  } catch (e) {
    return { ok: false, error: mensajeDe(e) };
  }
}

/** Desbloquea Checador con la huella o el rostro. */
export async function desbloquearConPasskey(): Promise<Resultado> {
  try {
    const respuesta = await startAuthentication({ optionsJSON: await pedirOpciones("desbloqueo") });
    return await enviar("/api/acceso/passkey/desbloquear", respuesta);
  } catch (e) {
    return { ok: false, error: mensajeDe(e) };
  }
}
