import type { Reconstruccion, ResultadoSemana } from "@checador/jornada";
import { sumarDias } from "@/lib/fechas";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function hm(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** Tabla semanal compartida por la PWA y el panel: ambos ven exactamente los mismos números. */
export function TablaSemana({
  lunes,
  semana,
  reconstruccion,
}: {
  lunes: string;
  semana: ResultadoSemana;
  reconstruccion: Reconstruccion;
}) {
  const turnosPorDia = new Map<string, typeof reconstruccion.turnos>();
  for (const t of reconstruccion.turnos) {
    const f = t.inicio.slice(0, 10);
    turnosPorDia.set(f, [...(turnosPorDia.get(f) ?? []), t]);
  }
  return (
    <>
        <table className="tabla">
          <thead>
            <tr>
              <th>Día</th>
              <th>Turnos</th>
              <th>Trabajado</th>
              <th>Extra</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).map((fecha) => {
              const dia = semana.dias.find((d) => d.fecha === fecha);
              const turnos = turnosPorDia.get(fecha) ?? [];
              const extra = (dia?.extraDobleMin ?? 0) + (dia?.extraTripleMin ?? 0);
              return (
                <tr key={fecha}>
                  <td>
                    {DIAS[new Date(`${fecha}T00:00:00Z`).getUTCDay()]} {fecha.slice(8)}
                  </td>
                  <td>
                    {turnos.length === 0
                      ? "—"
                      : turnos.map((t) => (
                          <div key={t.inicio}>
                            {t.inicio.slice(11)}–{t.fin.slice(11)}
                            {t.pausas?.map((p) => (
                              <small key={p.inicio}>
                                {" "}
                                pausa {p.inicio.slice(11)}–{p.fin.slice(11)}
                                {p.puedeSalir ? "" : " (cuenta como jornada)"}
                              </small>
                            ))}
                            {t.tieneDiferidos && <small className="etiqueta">sin conexión</small>}
                          </div>
                        ))}
                  </td>
                  <td>{dia ? hm(dia.trabajadoMin) : "—"}</td>
                  <td>{extra ? hm(extra) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td>{hm(semana.totales.trabajadoMin)}</td>
              <td>{hm(semana.totales.extraDobleMin + semana.totales.extraTripleMin)}</td>
            </tr>
          </tfoot>
        </table>

        <dl className="resumen">
          <dt>Jornada ordinaria</dt>
          <dd>
            {hm(semana.totales.ordinariaMin)} de {hm(semana.jornadaSemanalMaxMin)} máximo legal
          </dd>
          <dt>Extra pagada al doble</dt>
          <dd>{hm(semana.totales.extraDobleMin)}</dd>
          <dt>Extra pagada al triple</dt>
          <dd>{hm(semana.totales.extraTripleMin)}</dd>
        </dl>

        {reconstruccion.incidencias.length > 0 && (
          <div className="mensaje mensaje-aviso">
            <p>Registros incompletos (pide a tu empleador que los corrija):</p>
            <ul>
              {reconstruccion.incidencias.map((i) => (
                <li key={`${i.codigo}-${i.eventoId}`}>{i.mensaje}</li>
              ))}
            </ul>
          </div>
        )}

        {semana.alertas.length > 0 && (
          <div className="mensaje mensaje-aviso">
            <ul>
              {semana.alertas.map((a, i) => (
                <li key={i}>
                  {a.mensaje} <small>({a.fundamento})</small>
                </li>
              ))}
            </ul>
          </div>
        )}

    </>
  );
}
