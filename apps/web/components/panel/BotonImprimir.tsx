"use client";

export function BotonImprimir() {
  return (
    <button className="boton-chico" onClick={() => window.print()}>
      Imprimir para firma en papel
    </button>
  );
}
