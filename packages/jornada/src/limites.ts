/**
 * Límites legales de jornada y tiempo extraordinario.
 *
 * Fuente: LFT vigente (reforma DOF 01-05-2026), arts. 59, 61, 66 y 68,
 * y transitorios segundo y cuarto del decreto.
 */

import type { TipoJornada } from "./tipos.js";

/** Fecha de entrada en vigor del decreto (transitorio primero). */
export const INICIO_VIGENCIA = "2026-05-01";

/**
 * Jornada ordinaria máxima semanal en horas, por año (transitorio segundo).
 * Desde 2030 aplica el art. 59: 40 horas.
 */
const JORNADA_SEMANAL_HORAS: Readonly<Record<number, number>> = {
  2026: 48,
  2027: 46,
  2028: 44,
  2029: 42,
  2030: 40,
};

/**
 * Tope semanal de horas extraordinarias del art. 66, por año (transitorio cuarto).
 * Desde 2030 aplica el art. 66: 12 horas.
 */
const TOPE_EXTRA_SEMANAL_HORAS: Readonly<Record<number, number>> = {
  2026: 9,
  2027: 9,
  2028: 10,
  2029: 11,
  2030: 12,
};

/** Art. 66: máximo de horas extra (pagadas al doble) por día. */
export const MAX_EXTRA_DOBLE_DIARIO_MIN = 4 * 60;
/** Art. 66: máximo de días por semana con horas extra pagadas al doble. */
export const MAX_DIAS_EXTRA_DOBLE_SEMANA = 4;
/** Art. 68, 2.º párr.: máximo de horas al triple por semana (lo que excede el art. 66). */
export const MAX_EXTRA_TRIPLE_SEMANAL_MIN = 4 * 60;
/** Art. 68, 3.er párr.: jornada ordinaria + extraordinaria nunca mayor a 12 h diarias. */
export const MAX_TOTAL_DIARIO_MIN = 12 * 60;

/** Art. 61: duración de la jornada diaria según su tipo, en minutos. */
export const JORNADA_DIARIA_ART61_MIN: Readonly<Record<TipoJornada, number>> = {
  diurna: 8 * 60,
  nocturna: 7 * 60,
  mixta: 7 * 60 + 30,
};

function anioValido(anio: number): number {
  if (!Number.isInteger(anio) || anio < 2026) {
    throw new RangeError(
      `Año ${anio} fuera de alcance: el motor solo aplica desde la reforma (${INICIO_VIGENCIA}).`,
    );
  }
  return Math.min(anio, 2030);
}

/** Jornada ordinaria máxima semanal (minutos) vigente en un año. */
export function jornadaSemanalMaxMin(anio: number): number {
  return JORNADA_SEMANAL_HORAS[anioValido(anio)]! * 60;
}

/** Tope semanal de horas extra pagadas al doble (minutos) vigente en un año. */
export function topeExtraSemanalMin(anio: number): number {
  return TOPE_EXTRA_SEMANAL_HORAS[anioValido(anio)]! * 60;
}
