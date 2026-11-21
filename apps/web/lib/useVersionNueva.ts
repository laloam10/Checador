"use client";

import { useEffect, useState } from "react";
import { DESPLIEGUE, hayVersionNueva, INTERVALO_DESPLIEGUE_MS } from "./despliegue";

/** true cuando el servidor ya tiene un despliegue distinto al de esta página. */
export function useVersionNueva(): boolean {
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    if (nueva) return;
    let vigente = true;
    const revisar = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/despliegue", { cache: "no-store" });
        if (!r.ok) return;
        if (vigente && hayVersionNueva(DESPLIEGUE, await r.json())) setNueva(true);
      } catch {
        // Sin red: se vuelve a intentar en la siguiente revisión.
      }
    };
    void revisar();
    const periodico = setInterval(revisar, INTERVALO_DESPLIEGUE_MS);
    const visible = () => document.visibilityState === "visible" && void revisar();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", revisar);
    return () => {
      vigente = false;
      clearInterval(periodico);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", revisar);
    };
  }, [nueva]);

  return nueva;
}
