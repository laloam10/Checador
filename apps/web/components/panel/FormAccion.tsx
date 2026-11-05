"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { Estado } from "@/app/panel/acciones";

/**
 * Formulario ligado a una Server Action con mensaje de resultado.
 *
 * No usa `<form action>` porque React 19 vacía el formulario al terminar la
 * acción aunque haya fallado, y el usuario perdería lo que escribió. Aquí solo
 * se limpia si la acción tuvo éxito y `limpiar` es verdadero.
 */
export function FormAccion({
  accion,
  boton,
  children,
  className = "form-panel",
  peligro,
  limpiar,
}: {
  accion: (prev: Estado, fd: FormData) => Promise<Estado>;
  boton: string;
  children: React.ReactNode;
  className?: string;
  peligro?: boolean;
  limpiar?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok && limpiar) formulario.current?.reset();
  }, [estado, limpiar]);

  return (
    <form
      ref={formulario}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
    >
      {children}
      <button className={peligro ? "boton boton-peligro" : "boton"} disabled={pendiente}>
        {pendiente ? "Guardando…" : boton}
      </button>
      {estado && (
        <p className={`mensaje ${estado.ok ? "mensaje-ok" : "mensaje-error"}`} role="status">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
