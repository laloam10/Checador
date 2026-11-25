/** Mientras carga una pantalla de la persona trabajadora: la silueta de la pantalla, no un hueco. */
export default function Cargando() {
  return (
    <main className="esqueleto" aria-busy="true" aria-label="Cargando">
      <div className="esqueleto-barra esqueleto-oscuro" />
      <div className="esqueleto-bloque esqueleto-alto esqueleto-oscuro" />
      <div className="esqueleto-bloque" />
      <div className="esqueleto-bloque esqueleto-corto" />
    </main>
  );
}
