"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Modo = "codigo" | "pin" | "passkey";

/** La persona elige qué pasa al tocar "Salir" (migración 20261127000001_acceso_bloqueo.sql). */
export function AccesoAlSalir({ modo, tienePin, tienePasskey }: { modo: Modo; tienePin: boolean; tienePasskey: boolean }) {
  const router = useRouter();
  const [actual, setActual] = useState<Modo>(modo);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function elegir(nuevo: Modo) {
    if (nuevo === actual) return;
    const anterior = actual;
    setActual(nuevo);
    setGuardando(true);
    setEstado(null);
    const { error } = await crearClienteNavegador().rpc("elegir_acceso_al_salir", { p_modo: nuevo });
    setGuardando(false);
    if (error) {
      setActual(anterior);
      setEstado({ tipo: "error", texto: error.message });
      return;
    }
    setEstado({
      tipo: "ok",
      texto:
        nuevo === "pin"
          ? "Listo: al salir, volverás a entrar con tu PIN."
          : nuevo === "passkey"
            ? "Listo: al salir, volverás a entrar con tu huella o rostro."
            : "Listo: al salir, te pediremos el código de tu correo.",
    });
    router.refresh();
  }

  return (
    <fieldset className="opciones-acceso" disabled={guardando}>
      <legend>Al salir de Checador en este teléfono</legend>
      <label className={`opcion-acceso ${actual === "passkey" ? "elegida" : ""}`}>
        <input type="radio" name="al-salir" checked={actual === "passkey"} disabled={!tienePasskey} onChange={() => elegir("passkey")} />
        <span>
          <strong>Volver a entrar con mi huella o rostro</strong>
          <small>{tienePasskey ? "Lo más rápido. Si falla, puedes usar tu PIN." : "Primero registra tu huella o rostro abajo."}</small>
        </span>
      </label>
      <label className={`opcion-acceso ${actual === "pin" ? "elegida" : ""}`}>
        <input type="radio" name="al-salir" checked={actual === "pin"} disabled={!tienePin} onChange={() => elegir("pin")} />
        <span>
          <strong>Volver a entrar con mi PIN</strong>
          <small>{tienePin ? "Sin esperar el correo. Tu sesión queda bloqueada y nadie puede checar por ti." : "Primero crea tu PIN abajo."}</small>
        </span>
      </label>
      <label className={`opcion-acceso ${actual === "codigo" ? "elegida" : ""}`}>
        <input type="radio" name="al-salir" checked={actual === "codigo"} onChange={() => elegir("codigo")} />
        <span>
          <strong>Pedir el código de mi correo</strong>
          <small>Cierra la sesión por completo. Útil si compartes este teléfono.</small>
        </span>
      </label>
      {estado && <p className={`mensaje mensaje-${estado.tipo}`}>{estado.texto}</p>}
    </fieldset>
  );
}
