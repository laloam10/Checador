/**
 * Horarios de trabajo en el panel: reglas puras (sin base de datos) para poder probarlas.
 * El cálculo de señales (retardo, salida anticipada…) está en @checador/jornada.
 *
 * El horario es informativo y define la jornada pactada (art. 58); no cambia cómo se mide el
 * tiempo extra (por duración, arts. 66 a 68) ni bloquea checadas. Ver la migración
 * 20261126000001_horarios.sql.
 */
import { duracionTramo, type Horario, type TramoHorario } from "@checador/jornada";

export interface HorarioFila {
  id: string;
  nombre: string;
  dias: Record<string, TramoHorario>;
  tolerancia_min: number;
}

/** Orden de la semana laboral en pantalla: lunes a domingo. */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const aHorario = (f: Pick<HorarioFila, "dias" | "tolerancia_min">): Horario => ({ dias: f.dias, toleranciaMin: f.tolerancia_min });

/** Horario que aplica a una persona: el suyo, si no el de la empresa; ninguno si es "sin horario fijo". */
export function horarioEfectivo(
  t: { horario_id: string | null; sin_horario_fijo: boolean },
  horarios: HorarioFila[],
  predeterminado: string | null,
): HorarioFila | null {
  if (t.sin_horario_fijo) return null;
  const id = t.horario_id ?? predeterminado;
  return horarios.find((h) => h.id === id) ?? null;
}

const igual = (a: TramoHorario | undefined, b: TramoHorario | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function tramoTexto(t: TramoHorario): string {
  return `${t.entrada}–${t.salida}${t.pausa_inicio ? ` (comida ${t.pausa_inicio}–${t.pausa_fin})` : ""}`;
}

/** "Lun–Vie 08:00–17:00 (comida 13:00–14:00) · Sáb 08:00–13:00". Agrupa días seguidos iguales. */
export function resumenHorario(dias: Record<string, TramoHorario>): string {
  const partes: string[] = [];
  let i = 0;
  while (i < ORDEN_DIAS.length) {
    const d = ORDEN_DIAS[i]!;
    const t = dias[String(d)];
    if (!t) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < ORDEN_DIAS.length && igual(dias[String(ORDEN_DIAS[j + 1])], t)) j++;
    const rango = j === i ? DIAS_CORTOS[d] : `${DIAS_CORTOS[d]}–${DIAS_CORTOS[ORDEN_DIAS[j]!]}`;
    partes.push(`${rango} ${tramoTexto(t)}`);
    i = j + 1;
  }
  return partes.join(" · ");
}

/** Minutos de trabajo programados en un día (sin la comida). */
export const minutosNetos = (t: TramoHorario) =>
  duracionTramo(t) - (t.pausa_inicio && t.pausa_fin ? duracionTramo({ entrada: t.pausa_inicio, salida: t.pausa_fin }) : 0);

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lee el formulario de un horario. Campos: nombre, tolerancia, y por día d (0–6): dia_d (casilla),
 * entrada_d, salida_d, pausa_inicio_d, pausa_fin_d. Devuelve el horario o el primer error.
 */
export function horarioDesdeFormulario(
  valor: (campo: string) => string,
): { ok: true; nombre: string; dias: Record<string, TramoHorario>; tolerancia: number } | { ok: false; error: string } {
  const nombre = valor("nombre").trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, error: "Escribe un nombre para el horario (por ejemplo, Matutino)." };
  if (nombre.length > 60) return { ok: false, error: "El nombre es muy largo (máximo 60 caracteres)." };
  const tolerancia = Number(valor("tolerancia") || "10");
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 60) return { ok: false, error: "La tolerancia debe ser de 0 a 60 minutos." };

  const dias: Record<string, TramoHorario> = {};
  for (const d of ORDEN_DIAS) {
    if (valor(`dia_${d}`) !== "on") continue;
    const nombreDia = DIAS_LARGOS[d]!;
    const entrada = valor(`entrada_${d}`);
    const salida = valor(`salida_${d}`);
    if (!RE_HORA.test(entrada) || !RE_HORA.test(salida)) return { ok: false, error: `${nombreDia}: escribe la hora de entrada y de salida.` };
    const tramo: TramoHorario = { entrada, salida };
    const pi = valor(`pausa_inicio_${d}`);
    const pf = valor(`pausa_fin_${d}`);
    if (pi || pf) {
      if (!RE_HORA.test(pi) || !RE_HORA.test(pf)) return { ok: false, error: `${nombreDia}: escribe el inicio y el fin de la comida, o deja los dos vacíos.` };
      const bruto = duracionTramo(tramo);
      const desdeEntrada = duracionTramo({ entrada, salida: pi }) % 1440;
      if (desdeEntrada + duracionTramo({ entrada: pi, salida: pf }) >= bruto) return { ok: false, error: `${nombreDia}: la comida debe quedar dentro del turno.` };
      tramo.pausa_inicio = pi;
      tramo.pausa_fin = pf;
    }
    if (duracionTramo(tramo) > 16 * 60) return { ok: false, error: `${nombreDia}: el turno no puede durar más de 16 horas.` };
    if (minutosNetos(tramo) > 12 * 60) return { ok: false, error: `${nombreDia}: más de 12 horas de trabajo en un día no se pueden pactar como jornada.` };
    dias[String(d)] = tramo;
  }
  if (!Object.keys(dias).length) return { ok: false, error: "Marca al menos un día de trabajo." };
  return { ok: true, nombre, dias, tolerancia };
}
