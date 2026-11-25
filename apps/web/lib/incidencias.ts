import { aHoraLocal, type Incidencia } from "@checador/jornada";
import { sumarDias } from "./fechas";

/**
 * Solo las incidencias de checadas que caen dentro de la semana (lunes a domingo, hora local
 * del centro). La semana se reconstruye con un margen de días antes y después para no partir
 * turnos en los bordes; un turno que queda partido por ese margen (p. ej., el del viernes en la
 * tarde, cuya entrada quedó fuera) aparecería como "salida sin entrada" en la semana
 * siguiente aunque esté completo. Esas incidencias no son de esta semana.
 */
export function incidenciasDeLaSemana(
  incidencias: readonly Incidencia[],
  filas: readonly { id: number | string; hora_efectiva: string }[],
  zonaHoraria: string,
  lunes: string,
): Incidencia[] {
  const fin = sumarDias(lunes, 7);
  const hora = new Map(filas.map((f) => [String(f.id), f.hora_efectiva]));
  return incidencias.filter((i) => {
    const h = hora.get(String(i.eventoId));
    if (!h) return true; // sin hora conocida: se muestra (mejor de más que de menos)
    const dia = aHoraLocal(h, zonaHoraria).slice(0, 10);
    return dia >= lunes && dia < fin;
  });
}
