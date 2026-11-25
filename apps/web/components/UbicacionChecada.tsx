"use client";

import { useRef, useState } from "react";
import { distanciaLegible } from "@/lib/ubicacion";

export interface UbicacionFila {
  evento_id: number;
  estado: "ok" | "denegada" | "no_disponible";
  latitud: number | null;
  longitud: number | null;
  precision_m: number | null;
  distancia_m: number | null;
  dentro: boolean | null;
  dispositivo: "celular" | "kiosco";
}

/**
 * Ubicación de una checada: señal informativa (no invalida la checada ni va en las exportaciones).
 * "Ver en mapa" abre Google Maps solo cuando se toca: dentro de Checador si hay llave de la Maps
 * Embed API (GOOGLE_MAPS_EMBED_KEY), o en Google Maps si no la hay. Antes de tocarlo, nada se
 * manda a Google.
 */
export function UbicacionChecada({ u, llaveMapa }: { u: UbicacionFila; llaveMapa: string | null }) {
  const ventana = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);

  if (u.estado !== "ok" || u.latitud == null || u.longitud == null) {
    return <span className="etiqueta etiqueta-neutra">{u.estado === "denegada" ? "sin permiso de ubicación" : "ubicación no disponible"}</span>;
  }
  const punto = `${u.latitud},${u.longitud}`;
  const enGoogle = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(punto)}`;
  const insertado = llaveMapa
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(llaveMapa)}&q=${encodeURIComponent(punto)}&zoom=17`
    : null;

  function abrir() {
    setAbierto(true);
    ventana.current?.showModal();
  }

  return (
    <>
      <span className={`etiqueta ${u.dentro ? "etiqueta-ok" : ""}`} title={u.precision_m ? `Precisión del dispositivo: ±${u.precision_m} m` : undefined}>
        {u.dentro ? "en el centro" : "fuera del centro"}
        {u.distancia_m != null && ` · ${distanciaLegible(u.distancia_m)}`}
        {u.precision_m != null && u.precision_m > 100 && ` (±${u.precision_m} m)`}
      </span>
      {insertado ? (
        <button type="button" className="enlace enlace-mapa" onClick={abrir}>ver en mapa</button>
      ) : (
        <a className="enlace-mapa" href={enGoogle} target="_blank" rel="noopener noreferrer">ver en mapa</a>
      )}
      {insertado && (
        <dialog ref={ventana} className="ventana-mapa" onClose={() => setAbierto(false)} aria-label="Ubicación de la checada">
          <div className="ventana-mapa-cabecera">
            <strong>
              {u.dispositivo === "kiosco" ? "Ubicación del kiosco" : "Ubicación del teléfono"} al checar
            </strong>
            <button type="button" className="enlace" onClick={() => ventana.current?.close()}>Cerrar</button>
          </div>
          {/* El iframe solo existe mientras la ventana está abierta. */}
          {abierto && (
            <iframe
              title="Mapa de la checada"
              src={insertado}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          )}
          <p className="ayuda">
            {u.dentro ? "Dentro" : "Fuera"} del radio del centro{u.distancia_m != null ? `, ${distanciaLegible(u.distancia_m)} de él` : ""}.
            {u.precision_m ? ` Precisión del dispositivo: ±${u.precision_m} m.` : ""} El GPS puede fallar en interiores.{" "}
            <a href={enGoogle} target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>
          </p>
        </dialog>
      )}
    </>
  );
}
