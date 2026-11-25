/** Mientras carga una sección del panel (la navegación del panel ya está a la vista). */
export default function CargandoPanel() {
  return (
    <div className="esqueleto esqueleto-panel" aria-busy="true" aria-label="Cargando">
      <div className="esqueleto-titulo" />
      <div className="esqueleto-fila">
        <div className="esqueleto-bloque" />
        <div className="esqueleto-bloque" />
        <div className="esqueleto-bloque" />
      </div>
      <div className="esqueleto-bloque esqueleto-alto" />
    </div>
  );
}
