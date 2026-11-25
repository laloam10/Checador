"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CLAVE_SUGERENCIA = "checador:sugerencia-acceso:cerrada";

function Icono({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const FIRMA = "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8 17c1.5-2 2.5-2 3 0s1.5 1 2.5-.5M8 12h5";
const CANDADO = "M7 11V7a5 5 0 0 1 9.9-1M5 11h14v10H5zM12 15v2";

/**
 * Lo que la persona tiene pendiente, en una sola tarjeta debajo de los botones de checar
 * (lo primero en la pantalla es siempre checar).
 */
export function Pendientes({ acuerdo, sugerirAcceso }: { acuerdo: number | null; sugerirAcceso: boolean }) {
  const [verSugerencia, setVerSugerencia] = useState(false);
  useEffect(() => setVerSugerencia(sugerirAcceso && localStorage.getItem(CLAVE_SUGERENCIA) !== "1"), [sugerirAcceso]);
  if (acuerdo === null && !verSugerencia) return null;

  return (
    <section className="pendientes" aria-label="Pendientes">
      {acuerdo !== null && (
        <Link href="/acuerdo" className="pendiente pendiente-importante">
          <span className="pendiente-icono"><Icono d={FIRMA} /></span>
          <span className="pendiente-texto">
            <strong>Tu empleador te envió el acuerdo de registro (versión {acuerdo})</strong>
            <span>Léelo con calma y fírmalo aquí</span>
          </span>
          <span className="pendiente-flecha" aria-hidden>›</span>
        </Link>
      )}
      {verSugerencia && (
        <div className="pendiente">
          <span className="pendiente-icono"><Icono d={CANDADO} /></span>
          <Link href="/acceso" className="pendiente-texto">
            <strong>¿No quieres esperar el código del correo cada vez que sales?</strong>
            <span>Vuelve a entrar con tu huella o tu PIN</span>
          </Link>
          <button type="button" className="enlace pendiente-cerrar" aria-label="No volver a mostrar"
            onClick={() => { localStorage.setItem(CLAVE_SUGERENCIA, "1"); setVerSugerencia(false); }}>
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
