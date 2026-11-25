"use client";

import { useEffect } from "react";
import { PantallaAviso } from "@/components/PantallaAviso";

/**
 * Error inesperado al mostrar una página. No se muestran detalles técnicos (pueden traer
 * datos); solo el código de referencia, para encontrar el error en los registros del servidor.
 */
export default function ErrorDePagina({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const referencia = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <PantallaAviso titulo="Algo salió mal">
      <p>No pudimos mostrar esta página. Tus registros no se perdieron: intenta de nuevo en un momento.</p>
      <div className="pantalla-aviso-acciones">
        <button type="button" className="boton" onClick={() => retry()}>Intentar de nuevo</button>
        <a className="boton-secundario" href="/">Ir al inicio</a>
      </div>
      {referencia && <p className="pantalla-aviso-referencia">Código de referencia: {referencia}</p>}
    </PantallaAviso>
  );
}
