"use client";

import { usePathname } from "next/navigation";
import { useVersionNueva } from "@/lib/useVersionNueva";

/**
 * Aviso de versión nueva en el panel y en las pantallas de la persona trabajadora.
 * No recarga solo: podría haber un formulario a medio llenar. El kiosco tiene su propia
 * regla (se recarga cuando nadie lo está usando, ver Kiosco.tsx).
 */
export function AvisoActualizacion() {
  const ruta = usePathname();
  if (ruta.startsWith("/kiosco")) return null;
  return <Aviso />;
}

function Aviso() {
  const nueva = useVersionNueva();
  if (!nueva) return null;
  return (
    <div className="aviso-actualizacion" role="status">
      <span>Hay una versión nueva de Checador.</span>
      <button type="button" className="secundario" onClick={() => window.location.reload()}>
        Actualizar
      </button>
    </div>
  );
}
