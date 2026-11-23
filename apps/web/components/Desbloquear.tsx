"use client";

import { useState } from "react";
import { Isotipo } from "@/components/Marca";
import { Teclado } from "@/components/Teclado";
import { desbloquearConPasskey } from "@/lib/passkeysCliente";

/** Pantalla de Checador bloqueado: se vuelve a entrar con la huella, el rostro o el PIN, sin código por correo. */
export function Desbloquear({
  nombre,
  siguiente,
  conPasskey,
  conPin,
}: {
  nombre: string | null;
  siguiente: string;
  conPasskey: boolean;
  conPin: boolean;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/acceso/desbloquear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const c = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) {
        window.location.href = siguiente;
        return;
      }
      if (r.status === 401) {
        window.location.href = "/entrar";
        return;
      }
      setError(c.error ?? "No se pudo verificar el PIN.");
    } catch {
      setError("Sin conexión: para desbloquear necesitas internet.");
    }
    setPin("");
    setEnviando(false);
  }

  async function conHuella() {
    setEnviando(true);
    setError(null);
    const r = await desbloquearConPasskey();
    if (r.ok) {
      window.location.href = siguiente;
      return;
    }
    setError(r.error);
    setEnviando(false);
  }

  async function cerrarSesion() {
    await fetch("/api/salir?completa=1", { method: "POST" });
    window.location.href = "/entrar";
  }

  return (
    <main className="desbloquear">
      <div className="desbloquear-marca">
        <Isotipo tamano={44} />
      </div>
      <h1>{nombre ? `Hola, ${nombre}` : "Checador está bloqueado"}</h1>
      {conPasskey && (
        <button type="button" className="principal boton-huella" disabled={enviando} onClick={conHuella}>
          Entrar con huella o rostro
        </button>
      )}
      {error && <p className="mensaje mensaje-error" role="alert">{error}</p>}
      {conPin && (
        <>
          <p className="ayuda">{conPasskey ? "O escribe tu PIN:" : "Escribe tu PIN para entrar."}</p>
          <div className="pin-puntos" aria-label={`${pin.length} dígitos escritos`}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span key={i} className={i < pin.length ? "lleno" : ""} />
            ))}
          </div>
          <Teclado valor={pin} onCambio={setPin} onOk={entrar} min={4} max={6} deshabilitado={enviando} />
        </>
      )}
      <div className="desbloquear-salida">
        <p className="ayuda">¿No puedes entrar u otra persona va a usar este teléfono?</p>
        <button type="button" className="enlace" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
        <p className="ayuda">Para volver a entrar te pediremos el código de tu correo.</p>
      </div>
    </main>
  );
}
