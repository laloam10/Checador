import { aHoraLocal } from "@checador/jornada";

/**
 * Fechas legibles y consistentes en toda la app ("lun 24 nov, 22:22"; "26 oct – 1 nov 2026").
 * Sin Intl: el texto es idéntico en el servidor y en cualquier navegador.
 */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const partes = (f: string) => ({ a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)), d: Number(f.slice(8, 10)) });
const diaSemana = (f: string) => DIAS[new Date(`${f.slice(0, 10)}T12:00:00Z`).getUTCDay()]!;

/** "14 sep 2015" a partir de YYYY-MM-DD. */
export function fecha(f: string): string {
  const { a, m, d } = partes(f);
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** "lun 24 nov 2026" a partir de YYYY-MM-DD. */
export function fechaConDia(f: string): string {
  return `${diaSemana(f)} ${fecha(f)}`;
}

/**
 * Un instante en la hora local del centro: "lun 24 nov, 22:22". El año se omite si es el
 * actual, salvo con `conAnio` (documentos y constancias).
 */
export function fechaHora(instante: string | Date, zona: string, conAnio = false): string {
  const local = aHoraLocal(instante, zona); // YYYY-MM-DDTHH:mm
  const { a, m, d } = partes(local);
  const anioActual = Number(aHoraLocal(new Date(), zona).slice(0, 4));
  return `${diaSemana(local)} ${d} ${MESES[m - 1]}${conAnio || a !== anioActual ? ` ${a}` : ""}, ${local.slice(11, 16)}`;
}

/** "26 oct – 1 nov 2026", "2 – 8 nov 2026" o "29 dic 2025 – 4 ene 2026". */
export function rangoFechas(desde: string, hasta: string): string {
  const x = partes(desde);
  const y = partes(hasta);
  if (x.a !== y.a) return `${fecha(desde)} – ${fecha(hasta)}`;
  if (x.m !== y.m) return `${x.d} ${MESES[x.m - 1]} – ${y.d} ${MESES[y.m - 1]} ${y.a}`;
  return `${x.d} – ${y.d} ${MESES[y.m - 1]} ${y.a}`;
}

/** Celular de 10 dígitos legible: "33 1892 2547" (quita el 52 de México). */
export function telefonoLegible(t: string): string {
  const n = t.replace(/^52(?=\d{10}$)/, "");
  return /^\d{10}$/.test(n) ? `${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}` : t;
}

/** Iniciales para el avatar: "José Hernández López" → "JH". */
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}
