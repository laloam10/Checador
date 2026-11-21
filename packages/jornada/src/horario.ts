/**
 * Horario de trabajo y señales informativas: retardo, salida anticipada, trabajo fuera de
 * horario y en día no programado.
 *
 * Estas señales NO tienen efecto legal ni cambian ningún cálculo: el tiempo extra se mide por
 * duración (arts. 66 a 68 LFT), no por la hora del reloj; trabajar fuera del horario no es por
 * sí mismo tiempo extra. Sirven para que la empresa vea y decida; no deben usarse para
 * descontar salario automáticamente (art. 110) ni bloquear o corregir checadas (art. 132
 * fr. XXXIV: el registro debe ser fiel).
 */
import { aMinutos, diaSemana, fechaDe, sumarDias } from "./tiempo";
import type { FechaHoraLocal, FechaLocal, Turno } from "./tipos";

/** Un día del horario, en hora local "HH:mm". Si salida <= entrada, el turno termina al día siguiente. */
export interface TramoHorario {
  entrada: string;
  salida: string;
  pausa_inicio?: string;
  pausa_fin?: string;
}

export interface Horario {
  /** Claves "0" (domingo) a "6" (sábado); los días sin clave no son laborables. */
  dias: Partial<Record<string, TramoHorario>>;
  /** Minutos de gracia antes de marcar una señal. */
  toleranciaMin: number;
}

export type CodigoSenal = "RETARDO" | "SALIDA_ANTICIPADA" | "FUERA_DE_HORARIO" | "DIA_NO_PROGRAMADO";

export interface SenalHorario {
  fecha: FechaLocal;
  codigo: CodigoSenal;
  minutos: number;
  mensaje: string;
}

const hhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const aLocal = (min: number): FechaHoraLocal => new Date(min * 60_000).toISOString().slice(0, 16);

/** Duración bruta en minutos de un tramo (cruza la medianoche si salida <= entrada). */
export function duracionTramo(t: Pick<TramoHorario, "entrada" | "salida">): number {
  return ((hhmm(t.salida) - hhmm(t.entrada) + 1439) % 1440) + 1;
}

/** Inicio y fin programados de un día, como horas locales; null si ese día no se trabaja. */
export function programadoDe(horario: Horario, fecha: FechaLocal): { inicio: FechaHoraLocal; fin: FechaHoraLocal } | null {
  const t = horario.dias[String(diaSemana(fecha))];
  if (!t) return null;
  const inicio = aMinutos(`${fecha}T${t.entrada}`);
  return { inicio: aLocal(inicio), fin: aLocal(inicio + duracionTramo(t)) };
}

/**
 * Día del horario al que pertenece un turno: el de su fecha, salvo que empiece poco después de
 * la medianoche dentro de un turno nocturno del día anterior.
 */
function diaDelTurno(horario: Horario, inicio: FechaHoraLocal): FechaLocal {
  const fecha = fechaDe(inicio);
  const anterior = programadoDe(horario, sumarDias(fecha, -1));
  if (anterior && aMinutos(anterior.fin) > aMinutos(`${fecha}T00:00`) && aMinutos(inicio) < aMinutos(anterior.fin)) {
    return sumarDias(fecha, -1);
  }
  return fecha;
}

const horaDe = (local: FechaHoraLocal) => local.slice(11);

/** Señales de una semana (o cualquier lista de turnos cerrados) frente al horario. */
export function senalesHorario(turnos: readonly Turno[], horario: Horario): SenalHorario[] {
  const tol = Math.max(0, horario.toleranciaMin);
  const porDia = new Map<FechaLocal, { inicio: number; fin: number; trabajado: number }>();
  for (const t of turnos) {
    const dia = diaDelTurno(horario, t.inicio);
    const i = aMinutos(t.inicio);
    const f = aMinutos(t.fin);
    const previo = porDia.get(dia);
    porDia.set(dia, previo
      ? { inicio: Math.min(previo.inicio, i), fin: Math.max(previo.fin, f), trabajado: previo.trabajado + (f - i) }
      : { inicio: i, fin: f, trabajado: f - i });
  }

  const senales: SenalHorario[] = [];
  for (const [fecha, d] of [...porDia].sort(([a], [b]) => a.localeCompare(b))) {
    const prog = programadoDe(horario, fecha);
    if (!prog) {
      senales.push({ fecha, codigo: "DIA_NO_PROGRAMADO", minutos: d.trabajado, mensaje: "Trabajó en un día que su horario no incluye." });
      continue;
    }
    const pIni = aMinutos(prog.inicio);
    const pFin = aMinutos(prog.fin);
    const retardo = d.inicio - pIni;
    if (retardo > tol) {
      senales.push({ fecha, codigo: "RETARDO", minutos: retardo, mensaje: `Entró ${retardo} min después de su horario (${horaDe(prog.inicio)}).` });
    }
    const anticipada = pFin - d.fin;
    if (anticipada > tol) {
      senales.push({ fecha, codigo: "SALIDA_ANTICIPADA", minutos: anticipada, mensaje: `Salió ${anticipada} min antes de su horario (${horaDe(prog.fin)}).` });
    }
    const antes = pIni - d.inicio;
    const despues = d.fin - pFin;
    const fuera = (antes > tol ? antes : 0) + (despues > tol ? despues : 0);
    if (fuera > 0) {
      senales.push({ fecha, codigo: "FUERA_DE_HORARIO", minutos: fuera, mensaje: `Trabajó ${fuera} min fuera de su horario (${horaDe(prog.inicio)}–${horaDe(prog.fin)}).` });
    }
  }
  return senales;
}

/** Minutos de retardo de una entrada (0 si llegó a tiempo o dentro de la tolerancia, o si ese día no se trabaja). */
export function retardoDe(horario: Horario, entrada: FechaHoraLocal): number {
  const prog = programadoDe(horario, diaDelTurno(horario, entrada));
  if (!prog) return 0;
  const r = aMinutos(entrada) - aMinutos(prog.inicio);
  return r > Math.max(0, horario.toleranciaMin) ? r : 0;
}
