import "server-only";

import { calcularSemanaDesdeFilas, configDe, type FilaEvento } from "./datos";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface KioscoConfig {
  empresa: string;
  centro: string | null;
  zonaHoraria: string;
}

/** Configuración del kiosco si el usuario actual es una cuenta de kiosco; si no, null. */
export async function miKiosco(supabase: Cliente, userId: string): Promise<KioscoConfig | null> {
  const { data, error } = await supabase
    .from("miembros")
    .select("empresas(razon_social, zona_horaria), centros_trabajo(nombre, zona_horaria)")
    .eq("user_id", userId)
    .eq("rol", "kiosco")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const empresa = uno(data.empresas) as { razon_social: string; zona_horaria: string } | null;
  const centro = uno(data.centros_trabajo) as { nombre: string; zona_horaria: string } | null;
  return {
    empresa: empresa?.razon_social ?? "",
    centro: centro?.nombre ?? null,
    zonaHoraria: centro?.zona_horaria ?? empresa?.zona_horaria ?? "America/Mexico_City",
  };
}

/** Semana terminada que la persona aún no revisa, o que objetó y el empleador ya corrigió. */
export interface SemanaPorRevisar {
  lunes: string;
  clase: "sin_respuesta" | "corregida";
}

/** Respuesta de las funciones kiosco_* de la base. */
export interface RespuestaKiosco {
  ok: boolean;
  codigo?:
    | "NO_ES_KIOSCO"
    | "KIOSCO_BLOQUEADO"
    | "TRABAJADOR_BLOQUEADO"
    | "CREDENCIALES"
    | "TIPO"
    | "RECHAZADO"
    | "SIN_ACUERDO"
    | "SEMANA"
    | "COMENTARIO"
    | "RESUMEN";
  semanas_por_revisar?: SemanaPorRevisar[];
  acuerdo_pendiente?: { id: string; version: number; contenido: string; folio: string } | null;
  error?: string;
  nombre?: string;
  duplicado?: boolean;
  hora_efectiva?: string;
  eventos?: {
    id: number;
    tipo: "entrada" | "salida" | "inicio_pausa" | "fin_pausa" | "correccion" | "anulacion";
    hora_efectiva: string;
    puede_salir: boolean | null;
    corrige_evento_id: number | null;
    diferido: boolean;
  }[];
}

/** Estado HTTP según el código: los bloqueos son temporales (429) y conviene reintentar después. */
export function estadoHttp(r: RespuestaKiosco): number {
  if (r.ok) return 200;
  switch (r.codigo) {
    case "NO_ES_KIOSCO":
      return 403;
    case "KIOSCO_BLOQUEADO":
    case "TRABAJADOR_BLOQUEADO":
      return 429;
    default:
      return 422;
  }
}

/** Respuesta de kiosco_semana(): checadas de la semana y datos para calcularla. */
export interface RespuestaSemanaKiosco extends RespuestaKiosco {
  dia_descanso?: number;
  dias_descanso_adicionales?: number[];
  jornada_pactada_min?: unknown;
  zona_horaria?: string;
}

/**
 * Calcula en el servidor una semana pendiente del trabajador que se identificó en el kiosco,
 * con el mismo motor que la app del celular.
 */
export async function semanaEnKiosco(supabase: Cliente, numero: string, pin: string, lunes: string) {
  const { data, error } = await supabase.rpc("kiosco_semana", { p_numero: numero, p_pin: pin, p_lunes: lunes });
  if (error) throw error;
  const r = data as RespuestaSemanaKiosco & { eventos?: FilaEvento[] };
  if (!r.ok) return { r, calculo: null };
  const calculo = calcularSemanaDesdeFilas(
    r.eventos ?? [],
    { zonaHoraria: r.zona_horaria ?? "America/Mexico_City", config: configDe(r.dia_descanso ?? 0, r.jornada_pactada_min, r.dias_descanso_adicionales ?? []) },
    lunes,
  );
  return { r, calculo };
}

export const esLunes = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).getUTCDay() === 1;

export function validarCredenciales(numero: unknown, pin: unknown): string | null {
  if (typeof numero !== "string" || !/^[0-9A-Za-z-]{1,20}$/.test(numero)) return "Número de empleado inválido.";
  if (typeof pin !== "string" || !/^[0-9]{4,6}$/.test(pin)) return "El PIN debe tener de 4 a 6 dígitos.";
  return null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
