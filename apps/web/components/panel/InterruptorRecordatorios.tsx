"use client";

import { useState, useTransition } from "react";
import { cambiarRecordatorios } from "@/app/panel/acciones";

/** Interruptor que guarda al tocarlo; si falla, vuelve al estado anterior y lo explica. */
export function InterruptorRecordatorios({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cambiar() {
    const nuevo = !activo;
    setActivo(nuevo);
    setMensaje(null);
    iniciar(async () => {
      const r = await cambiarRecordatorios(nuevo);
      if (!r?.ok) setActivo(!nuevo);
      setMensaje(r ? { ok: r.ok, texto: r.mensaje } : null);
    });
  }

  return (
    <div className="interruptor-fila">
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby="interruptor-recordatorios"
        className="interruptor"
        disabled={pendiente}
        onClick={cambiar}
      >
        <span className="interruptor-perilla" />
      </button>
      <div>
        <strong id="interruptor-recordatorios">Recordatorios de conformidad por correo</strong>
        <span className={`insignia-estado ${activo ? "insignia-ok" : "insignia-neutra"}`}>{activo ? "Activados" : "Desactivados"}</span>
        {mensaje && (
          <p className={mensaje.ok ? "ayuda" : "texto-error"} role="status">{mensaje.texto}</p>
        )}
      </div>
    </div>
  );
}
