"use client";

import Link from "next/link";
import { useState } from "react";
import type { HorasPersona } from "@/lib/horasSemana";

// Escala ordinal de un solo verde (de menos a más costoso), validada con el validador de la
// guía de visualización (--ordinal, superficie #fbfcf7): monótona, pasos visibles, un tono.
const SERIES = [
  { clave: "ordinariaMin", nombre: "Jornada ordinaria", color: "#86b55f" },
  { clave: "dobleMin", nombre: "Extra al doble", color: "#2f6e10" },
  { clave: "tripleMin", nombre: "Extra al triple", color: "#0a2103" },
] as const;

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/** Paso de la escala en horas: el menor que deje como mucho 6 marcas. */
function escala(maxMin: number) {
  const horas = maxMin / 60;
  const paso = [4, 8, 12, 24, 48].find((p) => Math.ceil(horas / p) <= 6) ?? 48;
  const tope = Math.max(paso, Math.ceil(horas / paso) * paso);
  return { paso, tope };
}

/**
 * Horas de la semana por persona: barras horizontales apiladas (ordinaria, extra al doble,
 * extra al triple) de más a menos horas, con el máximo legal semanal como referencia.
 * Ventana con el detalle al pasar el cursor o al enfocar; la tabla da los mismos datos.
 */
export function GraficaHoras({ personas, maximoMin, lunes }: { personas: HorasPersona[]; maximoMin: number; lunes: string }) {
  const [activa, setActiva] = useState<string | null>(null);
  const mayor = Math.max(maximoMin, ...personas.map((p) => p.totalMin));
  const { paso, tope } = escala(mayor);
  const pct = (min: number) => (min / (tope * 60)) * 100;
  const marcas = Array.from({ length: tope / paso + 1 }, (_, i) => i * paso);

  return (
    <>
      <ul className="leyenda" aria-label="Leyenda">
        {SERIES.map((s) => (
          <li key={s.clave}><span className="leyenda-muestra" style={{ background: s.color }} />{s.nombre}</li>
        ))}
        <li><span className="leyenda-linea" />Máximo legal semanal ({hm(maximoMin)})</li>
      </ul>

      <div className="grafica-horas" role="figure" aria-label="Horas trabajadas en la semana por persona; los mismos datos están en la tabla de abajo">
        {/* Rejilla y referencia, alineadas con la columna de las barras */}
        <div className="grafica-rejilla" aria-hidden>
          {marcas.map((h) => (
            <span key={h} className="grafica-marca" style={{ left: `${(h / tope) * 100}%` }}><span>{h}h</span></span>
          ))}
          <span className="grafica-maximo" style={{ left: `${pct(maximoMin)}%` }}><span>máx. {hm(maximoMin)}</span></span>
        </div>

        {personas.map((p) => (
          <div key={p.id} className={`grafica-fila ${activa === p.id ? "activa" : ""}`}>
            <Link href={`/panel/trabajadores/${p.id}/semana?semana=${lunes}`} className="grafica-nombre" title={p.nombre}>{p.nombre}</Link>
            <div
              className="grafica-pista"
              tabIndex={0}
              aria-label={`${p.nombre}: ${hm(p.totalMin)} trabajadas; ${hm(p.ordinariaMin)} ordinaria, ${hm(p.dobleMin)} extra al doble, ${hm(p.tripleMin)} extra al triple`}
              onPointerEnter={() => setActiva(p.id)}
              onPointerLeave={(e) => e.pointerType !== "touch" && setActiva((a) => (a === p.id ? null : a))}
              onFocus={() => setActiva(p.id)}
              onBlur={() => setActiva((a) => (a === p.id ? null : a))}
            >
              <div className="grafica-barra" style={{ width: `${pct(p.totalMin)}%` }}>
                {SERIES.filter((s) => p[s.clave] > 0).map((s) => (
                  <span key={s.clave} style={{ flexGrow: p[s.clave], background: s.color }} />
                ))}
              </div>
              <span className="grafica-total" style={{ left: `${pct(p.totalMin)}%` }}>{hm(p.totalMin)}</span>
              {activa === p.id && (
                <div className="grafica-ventana" role="tooltip" style={{ left: `min(calc(${pct(p.totalMin)}% + 3.6rem), calc(100% - 13rem))` }}>
                  <strong className="grafica-ventana-titulo">{p.nombre}</strong>
                  <span className="grafica-ventana-total"><b>{hm(p.totalMin)}</b> trabajadas</span>
                  {SERIES.map((s) => (
                    <span key={s.clave} className="grafica-ventana-fila">
                      <span className="grafica-ventana-clave" style={{ background: s.color }} />
                      <b>{hm(p[s.clave])}</b> {s.nombre.toLowerCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <details className="desplegable grafica-tabla">
        <summary>Ver como tabla</summary>
        <table className="tabla">
          <thead><tr><th>Persona</th><th>Trabajado</th><th>Ordinaria</th><th>Extra al doble</th><th>Extra al triple</th></tr></thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id}><td>{p.nombre}</td><td>{hm(p.totalMin)}</td><td>{hm(p.ordinariaMin)}</td><td>{hm(p.dobleMin)}</td><td>{hm(p.tripleMin)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
