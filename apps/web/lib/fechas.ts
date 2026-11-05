export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene `fecha` (YYYY-MM-DD). */
export function lunesDe(fecha: string): string {
  const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}
