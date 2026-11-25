/**
 * Ubicación al checar (opcional, por centro de trabajo; migración 20261129000001_ubicacion.sql).
 * Nunca impide checar: si no hay permiso o señal, la checada se envía igual con estado
 * "denegada" o "no_disponible". La base decide si se guarda (solo si el centro la activó).
 */
export interface UbicacionCaptura {
  estado: "ok" | "denegada" | "no_disponible";
  latitud?: number;
  longitud?: number;
  precisionM?: number;
  capturadaEn: string; // ISO
}

/** Valida lo que manda el dispositivo; cualquier cosa rara se descarta (la checada sigue). */
export function ubicacionDeCuerpo(x: unknown): UbicacionCaptura | null {
  if (!x || typeof x !== "object") return null;
  const u = x as Record<string, unknown>;
  if (u.estado !== "ok" && u.estado !== "denegada" && u.estado !== "no_disponible") return null;
  const capturadaEn = typeof u.capturadaEn === "string" && !Number.isNaN(Date.parse(u.capturadaEn)) ? u.capturadaEn : new Date().toISOString();
  if (u.estado !== "ok") return { estado: u.estado, capturadaEn };
  const { latitud, longitud, precisionM } = u;
  if (typeof latitud !== "number" || typeof longitud !== "number" || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) return null;
  return {
    estado: "ok",
    latitud,
    longitud,
    precisionM: typeof precisionM === "number" && Number.isFinite(precisionM) ? Math.round(Math.min(Math.max(precisionM, 0), 100000)) : undefined,
    capturadaEn,
  };
}

/** Parámetros de la función registrar_ubicacion de la base. */
export function parametrosUbicacion(eventoId: number, u: UbicacionCaptura) {
  return {
    p_evento: eventoId,
    p_estado: u.estado,
    p_latitud: u.latitud ?? null,
    p_longitud: u.longitud ?? null,
    p_precision_m: u.precisionM ?? null,
    p_capturada_en: u.capturadaEn,
  };
}

/** "a 40 m", "a 3.2 km". */
export function distanciaLegible(metros: number): string {
  return metros < 1000 ? `a ${metros} m` : `a ${(metros / 1000).toFixed(1)} km`;
}
