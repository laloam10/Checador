import { guardarHorario } from "@/app/panel/acciones";
import { FormAccion } from "@/components/panel/FormAccion";
import { DIAS_LARGOS, ORDEN_DIAS, type HorarioFila } from "@/lib/horarios";

/** Formulario para crear o editar un horario: nombre, tolerancia y, por día, entrada, salida y comida. */
export function FormHorario({ h }: { h?: HorarioFila }) {
  const base = h ? undefined : { entrada: "09:00", salida: "18:00", pausa_inicio: "14:00", pausa_fin: "15:00" };
  return (
    <FormAccion accion={guardarHorario} boton={h ? "Guardar cambios" : "Crear horario"} limpiar={!h} className="form-panel form-horario">
      {h && <input type="hidden" name="id" value={h.id} />}
      <div className="campos">
        <label>Nombre<input name="nombre" required maxLength={60} defaultValue={h?.nombre ?? ""} placeholder="Ej.: Matutino" /></label>
        <label>
          Tolerancia (minutos)
          <input name="tolerancia" type="number" min={0} max={60} defaultValue={h?.tolerancia_min ?? 10} />
          <span className="ayuda">Margen antes de marcar un retardo o una salida anticipada.</span>
        </label>
      </div>
      <table className="tabla tabla-horario">
        <thead>
          <tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Comida desde</th><th>Comida hasta</th></tr>
        </thead>
        <tbody>
          {ORDEN_DIAS.map((d) => {
            const t = h ? h.dias[String(d)] : d >= 1 && d <= 5 ? base : undefined;
            const v = t ?? base ?? { entrada: "09:00", salida: "18:00" };
            return (
              <tr key={d}>
                <td>
                  <label className="casilla-linea">
                    <input type="checkbox" name={`dia_${d}`} defaultChecked={Boolean(t)} />
                    {DIAS_LARGOS[d]}
                  </label>
                </td>
                <td><input type="time" name={`entrada_${d}`} defaultValue={v.entrada} aria-label={`${DIAS_LARGOS[d]}: entrada`} /></td>
                <td><input type="time" name={`salida_${d}`} defaultValue={v.salida} aria-label={`${DIAS_LARGOS[d]}: salida`} /></td>
                <td><input type="time" name={`pausa_inicio_${d}`} defaultValue={t ? (t.pausa_inicio ?? "") : (v.pausa_inicio ?? "")} aria-label={`${DIAS_LARGOS[d]}: comida desde`} /></td>
                <td><input type="time" name={`pausa_fin_${d}`} defaultValue={t ? (t.pausa_fin ?? "") : (v.pausa_fin ?? "")} aria-label={`${DIAS_LARGOS[d]}: comida hasta`} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ayuda">
        Si la salida es anterior a la entrada (por ejemplo, 22:00 a 06:00), el turno termina al día siguiente. Deja la comida
        vacía si no hay pausa. Los días sin marcar no son laborables en este horario.
      </p>
    </FormAccion>
  );
}
