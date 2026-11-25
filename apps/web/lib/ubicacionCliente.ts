"use client";

import type { UbicacionCaptura } from "./ubicacion";

/**
 * Ubicación del dispositivo al checar. Nunca lanza error ni espera más de `esperaMs`:
 * si no hay permiso o señal, devuelve el estado para que la checada se registre igual.
 */
export function obtenerUbicacion(esperaMs = 4000, maximaEdadMs = 120_000): Promise<UbicacionCaptura> {
  const ahora = () => new Date().toISOString();
  return new Promise((resolver) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolver({ estado: "no_disponible", capturadaEn: ahora() });
      return;
    }
    let listo = false;
    const terminar = (u: UbicacionCaptura) => {
      if (listo) return;
      listo = true;
      resolver(u);
    };
    // Respaldo por si el navegador nunca responde (p. ej. la ventana de permiso quedó abierta).
    const limite = setTimeout(() => terminar({ estado: "no_disponible", capturadaEn: ahora() }), esperaMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(limite);
        terminar({
          estado: "ok",
          latitud: p.coords.latitude,
          longitud: p.coords.longitude,
          precisionM: Math.round(p.coords.accuracy),
          capturadaEn: new Date(p.timestamp || Date.now()).toISOString(),
        });
      },
      (e) => {
        clearTimeout(limite);
        terminar({ estado: e.code === e.PERMISSION_DENIED ? "denegada" : "no_disponible", capturadaEn: ahora() });
      },
      { enableHighAccuracy: true, timeout: esperaMs, maximumAge: maximaEdadMs },
    );
  });
}
