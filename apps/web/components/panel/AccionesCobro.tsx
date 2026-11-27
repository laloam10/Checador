"use client";

import { useActionState, useState } from "react";
import { administrarPago, contratar } from "@/app/panel/cobro-acciones";

/** Contratar con tarjeta (elige mensual o anual) y abre la página de pago de Stripe. */
export function ContratarCobro({ mensual, anual, nota, boton }: { mensual: string; anual: string; nota: string; boton: string }) {
  const [estado, accion, pendiente] = useActionState(contratar, null);
  const [ciclo, setCiclo] = useState<"mensual" | "anual">("mensual");
  return (
    <form action={accion} className="cobro-contratar">
      <fieldset className="cobro-ciclos">
        <legend>¿Cómo quieres pagar?</legend>
        <label className={ciclo === "mensual" ? "elegido" : ""}>
          <input type="radio" name="ciclo" value="mensual" checked={ciclo === "mensual"} onChange={() => setCiclo("mensual")} />
          <strong>Mensual</strong><span>{mensual} al mes + IVA</span>
        </label>
        <label className={ciclo === "anual" ? "elegido" : ""}>
          <input type="radio" name="ciclo" value="anual" checked={ciclo === "anual"} onChange={() => setCiclo("anual")} />
          <strong>Anual</strong><span>{anual} al año + IVA · 2 meses de regalo</span>
        </label>
      </fieldset>
      <button className="boton" disabled={pendiente}>{pendiente ? "Abriendo la página de pago…" : boton}</button>
      <p className="ayuda">{nota}</p>
      {estado && <p className="mensaje mensaje-error" role="alert">{estado.mensaje}</p>}
    </form>
  );
}

/** Abre el portal de Stripe: cambiar tarjeta, ver facturas, datos fiscales o cancelar. */
export function AdministrarCobro({ texto = "Administrar pago y facturas" }: { texto?: string }) {
  const [estado, accion, pendiente] = useActionState(administrarPago, null);
  return (
    <form action={accion} className="cobro-administrar">
      <button className="boton-secundario" disabled={pendiente}>{pendiente ? "Abriendo…" : texto}</button>
      {estado && <p className="mensaje mensaje-error" role="alert">{estado.mensaje}</p>}
    </form>
  );
}
