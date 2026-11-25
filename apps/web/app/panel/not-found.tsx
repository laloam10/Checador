import Link from "next/link";

/** Dentro del panel: conserva la navegación y ofrece volver a la lista. */
export default function NoEncontradaPanel() {
  return (
    <div className="estado-vacio pantalla-aviso-panel">
      <span className="estado-vacio-icono" aria-hidden>?</span>
      <div>
        <strong>No encontramos lo que buscas.</strong>
        <p>La persona o la página no existe, o no pertenece a tu empresa.</p>
        <p><Link href="/panel/trabajadores">Ir a Trabajadores</Link> · <Link href="/panel">Ir al tablero</Link></p>
      </div>
    </div>
  );
}
