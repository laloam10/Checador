"use client";

import { useRef, useState } from "react";
import { anularChecada, corregirChecada } from "@/app/panel/acciones";
import { FormAccion } from "./FormAccion";

/**
 * "Corregir o anular" una checada en una ventana, en lugar de formularios dentro de la lista.
 * Al guardar, la ventana se cierra y la confirmación queda en el renglón. Ninguna corrección
 * borra la checada original (bitácora de solo inserción): se agrega un registro con su motivo.
 */
export function AccionesChecada({ trabajadorId, eventoId, descripcion, hora, maximo }: {
  trabajadorId: string;
  eventoId: number;
  descripcion: string;
  hora: string; // YYYY-MM-DDTHH:mm en la zona del centro
  maximo: string;
}) {
  const ventana = useRef<HTMLDialogElement>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const terminar = (mensaje: string) => {
    ventana.current?.close();
    setHecho(mensaje);
  };

  return (
    <>
      <button type="button" className="enlace acciones-checada" onClick={() => { setHecho(null); ventana.current?.showModal(); }}>
        Corregir o anular
      </button>
      {hecho && <p className="mensaje mensaje-ok mensaje-renglon" role="status">{hecho}</p>}
      <dialog ref={ventana} className="ventana-accion" aria-label={`Cambiar checada: ${descripcion}`}>
        <div className="ventana-accion-cabecera">
          <div>
            <strong>Cambiar checada</strong>
            <span>{descripcion}</span>
          </div>
          <button type="button" className="enlace" onClick={() => ventana.current?.close()}>Cerrar</button>
        </div>
        <div className="ventana-accion-cuerpo">
          <section>
            <h3>Corregir la hora</h3>
            <FormAccion accion={corregirChecada} boton="Corregir hora" className="form-plano" alTerminar={terminar}>
              <input type="hidden" name="trabajador_id" value={trabajadorId} />
              <input type="hidden" name="evento_id" value={eventoId} />
              <div className="campos campos-2">
                <label>Hora correcta<input type="datetime-local" name="hora" required defaultValue={hora} max={maximo} /></label>
                <label>Motivo<input name="motivo" required placeholder="Ej.: olvidó checar a tiempo" /></label>
              </div>
            </FormAccion>
          </section>
          <section className="ventana-accion-peligro">
            <h3>Anular la checada</h3>
            <p className="ayuda">Para checadas duplicadas o capturadas por error. Queda tachada, con su motivo.</p>
            <FormAccion accion={anularChecada} boton="Anular checada" peligro className="form-linea" alTerminar={terminar}>
              <input type="hidden" name="trabajador_id" value={trabajadorId} />
              <input type="hidden" name="evento_id" value={eventoId} />
              <label>Motivo de la anulación<input name="motivo" required placeholder="Ej.: checada duplicada" /></label>
            </FormAccion>
          </section>
          <p className="ayuda">Nada se borra: la checada original se conserva y la persona ve el cambio con su motivo.</p>
        </div>
      </dialog>
    </>
  );
}
