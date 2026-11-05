import type { DiaSemana, FechaHoraLocal, FechaLocal } from "./tipos";

const RE_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_POR_DIA = 24 * 60;

/** Convierte una hora local a minutos absolutos (reloj de pared, sin zona horaria). */
export function aMinutos(valor: FechaHoraLocal): number {
  const m = RE_FECHA_HORA.exec(valor);
  if (!m) throw new TypeError(`Fecha y hora inválida: "${valor}" (se espera YYYY-MM-DDTHH:mm)`);
  const [, a, mes, d, h, min] = m.map(Number) as [number, number, number, number, number, number];
  const ms = Date.UTC(a, mes - 1, d, h, min);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mes - 1 || check.getUTCDate() !== d || h > 23 || min > 59) {
    throw new TypeError(`Fecha y hora inexistente: "${valor}"`);
  }
  return ms / 60_000;
}

export function fechaDe(valor: FechaHoraLocal): FechaLocal {
  aMinutos(valor);
  return valor.slice(0, 10);
}

export function fechaAMinutos(fecha: FechaLocal): number {
  if (!RE_FECHA.test(fecha)) throw new TypeError(`Fecha inválida: "${fecha}" (se espera YYYY-MM-DD)`);
  return aMinutos(`${fecha}T00:00`);
}

export function minutosAFecha(min: number): FechaLocal {
  return new Date(min * 60_000).toISOString().slice(0, 10);
}

export function sumarDias(fecha: FechaLocal, dias: number): FechaLocal {
  return minutosAFecha(fechaAMinutos(fecha) + dias * MIN_POR_DIA);
}

export function diaSemana(fecha: FechaLocal): DiaSemana {
  return new Date(fechaAMinutos(fecha) * 60_000).getUTCDay() as DiaSemana;
}

export function anioDe(fecha: FechaLocal): number {
  return Number(fecha.slice(0, 4));
}

/**
 * Minutos del intervalo [inicio, fin) que caen en horario nocturno (art. 60:
 * entre las 20:00 y las 06:00).
 */
export function minutosNocturnos(inicio: number, fin: number): number {
  let total = 0;
  // Recorre por día calendario para no iterar minuto a minuto.
  let diaBase = Math.floor(inicio / MIN_POR_DIA) * MIN_POR_DIA;
  while (diaBase < fin) {
    // Tramos nocturnos del día: [00:00, 06:00) y [20:00, 24:00).
    for (const [a, b] of [
      [diaBase, diaBase + 6 * 60],
      [diaBase + 20 * 60, diaBase + MIN_POR_DIA],
    ] as const) {
      total += Math.max(0, Math.min(fin, b) - Math.max(inicio, a));
    }
    diaBase += MIN_POR_DIA;
  }
  return total;
}
