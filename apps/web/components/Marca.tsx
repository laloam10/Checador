/**
 * Identidad de Checador, producto de Jemba (https://jemba.mx): un reloj cuyo interior es una
 * palomita (la jornada registrada), en el verde y el lima de Jemba.
 * Mismo dibujo que app/icon.svg; los íconos PNG de public/ salen de ahí con scripts/iconos.mjs.
 */
export function Isotipo({ tamano = 32, className }: { tamano?: number; className?: string }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect width="64" height="64" rx="16" fill="#2F6E10" />
      <circle cx="32" cy="32" r="19.5" fill="none" stroke="#fff" strokeWidth="4.5" />
      <path d="M32 7.5v5.5" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M23.5 32.5l6 6 11.5-13" fill="none" stroke="#C8E600" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Isotipo, nombre y una línea de contexto que siempre firma "por Jemba". */
export function Marca({ tamano = 32, subtitulo }: { tamano?: number; subtitulo?: string }) {
  return (
    <span className="marca">
      <Isotipo tamano={tamano} />
      <span className="marca-texto">
        <span className="marca-nombre">checador</span>
        <span className="marca-sub">{subtitulo ? `${subtitulo} · por Jemba` : "por Jemba"}</span>
      </span>
    </span>
  );
}
