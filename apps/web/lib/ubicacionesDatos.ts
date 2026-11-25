import "server-only";

import type { UbicacionFila } from "@/components/UbicacionChecada";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Ubicaciones de las checadas (RLS: el empleador y la propia persona). Solo existen si el centro las activó. */
export async function ubicacionesDe(supabase: Cliente, eventoIds: number[]): Promise<Map<number, UbicacionFila>> {
  if (!eventoIds.length) return new Map();
  const { data } = await supabase
    .from("ubicaciones_evento")
    .select("evento_id, estado, latitud, longitud, precision_m, distancia_m, dentro, dispositivo")
    .in("evento_id", eventoIds);
  return new Map(((data ?? []) as UbicacionFila[]).map((u) => [u.evento_id, u]));
}

/** Llave de la Maps Embed API (pública por diseño; restringida en Google Cloud a los dominios de Checador). */
export const llaveMapa = () => process.env.GOOGLE_MAPS_EMBED_KEY?.trim() || null;
