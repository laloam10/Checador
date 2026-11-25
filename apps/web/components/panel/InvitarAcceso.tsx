"use client";

import { useRef, useState } from "react";
import { invitar } from "@/app/panel/acciones";
import { FormAccion } from "./FormAccion";

type Rol = "kiosco" | "supervisor" | "admin";

const ROLES: { rol: Rol; nombre: string; detalle: string }[] = [
  { rol: "kiosco", nombre: "Kiosco", detalle: "Una tableta donde el personal checa con número y PIN. No ve el panel." },
  { rol: "supervisor", nombre: "Supervisor", detalle: "Consulta, corrige checadas con motivo, atiende objeciones y exporta." },
  { rol: "admin", nombre: "Administrador", detalle: "Todo, excepto invitar o quitar a otros administradores." },
];

/**
 * Invitar a una persona o una tableta, en una ventana. Al aceptar, la ventana se cierra y la
 * invitación aparece en la lista como pendiente hasta que entren con ese correo.
 */
export function InvitarAcceso({ centros, puedeAdmin, rolInicial = "kiosco", etiqueta = "Invitar", secundario = false }: {
  centros: { id: string; nombre: string }[];
  puedeAdmin: boolean;
  rolInicial?: Rol;
  etiqueta?: string;
  secundario?: boolean;
}) {
  const ventana = useRef<HTMLDialogElement>(null);
  const [rol, setRol] = useState<Rol>(rolInicial);
  const [hecho, setHecho] = useState<string | null>(null);
  const roles = ROLES.filter((r) => r.rol !== "admin" || puedeAdmin);

  return (
    <>
      <button type="button" className={secundario ? "boton-secundario" : "boton"}
        onClick={() => { setHecho(null); setRol(rolInicial); ventana.current?.showModal(); }}>
        {etiqueta}
      </button>
      {hecho && <p className="mensaje mensaje-ok mensaje-renglon" role="status">{hecho}</p>}
      <dialog ref={ventana} className="ventana-accion" aria-label="Invitar">
        <div className="ventana-accion-cabecera">
          <div>
            <strong>Invitar</strong>
            <span>Entra con ese correo y obtiene el acceso</span>
          </div>
          <button type="button" className="enlace" onClick={() => ventana.current?.close()}>Cerrar</button>
        </div>
        <div className="ventana-accion-cuerpo">
          <FormAccion accion={invitar} boton="Enviar invitación" className="form-plano" limpiar
            alTerminar={(m) => { ventana.current?.close(); setHecho(m); }}>
            <fieldset className="opciones-rol">
              <legend>Rol</legend>
              {roles.map((r) => (
                <label key={r.rol} className={rol === r.rol ? "elegida" : ""}>
                  <input type="radio" name="rol" value={r.rol} checked={rol === r.rol} onChange={() => setRol(r.rol)} />
                  <strong>{r.nombre}</strong>
                  <span>{r.detalle}</span>
                </label>
              ))}
            </fieldset>
            <div className="campos campos-2">
              <label>
                Correo
                <input name="email" type="email" required autoComplete="off"
                  placeholder={rol === "kiosco" ? "kiosco.matriz@tuempresa.mx" : "nombre@tuempresa.mx"} />
              </label>
              {rol === "kiosco" && (
                <label>
                  Centro de trabajo
                  <select name="centro_trabajo_id" defaultValue="">
                    <option value="">Todos los centros</option>
                    {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
              )}
            </div>
            {rol === "kiosco" && (
              <p className="ayuda">Usa un correo de la empresa al que tengas acceso: ahí llega el código para preparar la tableta.</p>
            )}
          </FormAccion>
        </div>
      </dialog>
    </>
  );
}
