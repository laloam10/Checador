"use client";

import { useState } from "react";

type Sistema = "android" | "iphone";

/** Pasos para instalar Checador como app (sin tienda de apps), por sistema. */
export function PestanasInstalacion({ inicial, dominio }: { inicial: Sistema; dominio: string }) {
  const [sistema, setSistema] = useState<Sistema>(inicial);
  const pasos: Record<Sistema, React.ReactNode[]> = {
    android: [
      <>Abre <strong>{dominio}</strong> en <strong>Chrome</strong>.</>,
      <>Toca el menú <strong>⋮</strong> (arriba a la derecha).</>,
      <>Elige <strong>Instalar app</strong> (o <strong>Agregar a la pantalla principal</strong>) y confirma con <strong>Instalar</strong>.</>,
      <>Abre <strong>Checador</strong> desde el ícono que aparece en tu pantalla de inicio.</>,
    ],
    iphone: [
      <>Abre <strong>{dominio}</strong> en <strong>Safari</strong>.</>,
      <>Toca el botón <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).</>,
      <>Elige <strong>Agregar a pantalla de inicio</strong> y confirma con <strong>Agregar</strong>.</>,
      <>Abre <strong>Checador</strong> desde el ícono que aparece en tu pantalla de inicio.</>,
    ],
  };

  return (
    <>
      <div className="guia-pestanas" role="tablist" aria-label="Sistema del teléfono">
        {(["android", "iphone"] as const).map((s) => (
          <button key={s} type="button" role="tab" id={`pestana-${s}`} aria-selected={sistema === s} aria-controls="pasos-instalacion"
            className={sistema === s ? "activa" : ""} onClick={() => setSistema(s)}>
            {s === "android" ? "Android" : "iPhone"}
          </button>
        ))}
      </div>
      <ol className="guia-lista" id="pasos-instalacion" role="tabpanel" aria-labelledby={`pestana-${sistema}`}>
        {pasos[sistema].map((p, i) => (
          <li key={`${sistema}-${i}`}><span className="guia-num">{i + 1}</span><div>{p}</div></li>
        ))}
      </ol>
      <p className="guia-nota">
        No necesitas tienda de apps. Si no ves la opción, revisa que estés en {sistema === "android" ? "Chrome" : "Safari"} y no
        dentro de otra app (como WhatsApp o Instagram): ábrelo con “Abrir en el navegador”.
        {sistema === "iphone" && " En iPhone, los avisos solo llegan si Checador está en tu pantalla de inicio (iOS 16.4 o posterior)."}
      </p>
    </>
  );
}
