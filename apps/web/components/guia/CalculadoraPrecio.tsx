"use client";

import { useState } from "react";

export interface PrecioCalculado {
  personas: number;
  total: string; // "$599" o "Cotización"
  detalle: string;
}

/**
 * Calculadora de la guía: los textos ya vienen calculados por lib/precios.ts (una entrada por
 * cada número de personas, de 1 a 41 = "más de 40"). Van también en data-precios para que el
 * HTML exportado a jemba.mx (scripts/guia-html.mjs) funcione con un script mínimo, sin React.
 */
export function CalculadoraPrecio({ precios, inicial = 10 }: { precios: PrecioCalculado[]; inicial?: number }) {
  const [personas, setPersonas] = useState(inicial);
  const p = precios[personas - 1]!;
  const maximo = precios.length;

  return (
    <div className="calculadora" data-precios={JSON.stringify(precios)}>
      <label htmlFor="calculadora-personas" className="calculadora-pregunta">
        ¿Cuántas personas trabajan contigo?
        <output id="calculadora-cuantas" htmlFor="calculadora-personas">{personas === maximo ? `Más de ${maximo - 1}` : personas}</output>
      </label>
      <input
        id="calculadora-personas"
        type="range"
        min={1}
        max={maximo}
        value={personas}
        onChange={(e) => setPersonas(Number(e.target.value))}
        aria-valuetext={personas === maximo ? `Más de ${maximo - 1} personas` : `${personas} personas`}
      />
      <p className="calculadora-total" aria-live="polite">
        <span id="calculadora-total">{p.total}</span>
        <small id="calculadora-unidad">{p.personas < maximo ? " al mes + IVA" : ""}</small>
      </p>
      <p className="calculadora-detalle" id="calculadora-detalle">{p.detalle}</p>
    </div>
  );
}
