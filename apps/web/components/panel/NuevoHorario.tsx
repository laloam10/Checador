"use client";

import { useState } from "react";

/**
 * "+ Nuevo horario": el formulario aparece al tocarlo. Es un componente de cliente para que
 * siga abierto (con su mensaje de "creado") cuando la página se actualiza tras guardar.
 */
export function NuevoHorario({ abiertoAlInicio, children }: { abiertoAlInicio: boolean; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  return (
    <div className="nuevo-horario">
      {abierto ? (
        <>
          <div className="nuevo-horario-cabecera">
            <h3>Nuevo horario</h3>
            <button type="button" className="enlace" onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
          {children}
        </>
      ) : (
        <button type="button" className="boton-secundario boton-agregar" onClick={() => setAbierto(true)}>
          + Nuevo horario
        </button>
      )}
    </div>
  );
}
