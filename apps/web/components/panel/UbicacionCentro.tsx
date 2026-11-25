"use client";

import { useRef, useState } from "react";

/** Llena latitud y longitud del centro con la ubicación de este dispositivo (estando en el lugar). */
export function BotonUbicacionCentro() {
  const boton = useRef<HTMLButtonElement>(null);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [buscando, setBuscando] = useState(false);

  function usar() {
    if (!navigator.geolocation) {
      setEstado({ tipo: "error", texto: "Este navegador no da la ubicación. Escribe las coordenadas." });
      return;
    }
    setBuscando(true);
    setEstado(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const form = boton.current?.closest("form");
        const poner = (nombre: string, valor: number) => {
          const campo = form?.elements.namedItem(nombre) as HTMLInputElement | null;
          if (campo) campo.value = valor.toFixed(5);
        };
        poner("latitud", p.coords.latitude);
        poner("longitud", p.coords.longitude);
        setBuscando(false);
        setEstado({
          tipo: "ok",
          texto: `Listo (precisión de ±${Math.round(p.coords.accuracy)} m). Revisa que estés en el centro y guarda.`,
        });
      },
      (e) => {
        setBuscando(false);
        setEstado({
          tipo: "error",
          texto: e.code === e.PERMISSION_DENIED ? "No diste permiso de ubicación. Escribe las coordenadas." : "No se pudo obtener la ubicación. Intenta de nuevo.",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="ubicacion-centro-boton">
      <button ref={boton} type="button" className="boton-chico" disabled={buscando} onClick={usar}>
        {buscando ? "Buscando…" : "Usar mi ubicación actual"}
      </button>
      {estado && <p className={`mensaje mensaje-${estado.tipo}`}>{estado.texto}</p>}
    </div>
  );
}
