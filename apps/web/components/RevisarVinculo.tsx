"use client";

import { useActionState } from "react";
import { revisarVinculo } from "@/app/cuenta-acciones";

export function RevisarVinculo() {
  const [estado, accion, pendiente] = useActionState(revisarVinculo, null);
  return (
    <form action={accion} className="revisar-vinculo">
      <button className="boton" disabled={pendiente}>{pendiente ? "Revisando…" : "Volver a revisar"}</button>
      {estado && <p className="mensaje mensaje-aviso" role="status">{estado.mensaje}</p>}
    </form>
  );
}
