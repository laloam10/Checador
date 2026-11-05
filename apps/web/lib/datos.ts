import "server-only";

import {
  calcularSemana,
  reconstruirTurnos,
  type ConfigTrabajador,
  type DiaSemana,
  type EventoBitacora,
  type ResultadoSemana,
  type Reconstruccion,
} from "@checador/jornada";
import type { crearClienteServidor } from "./supabase/server";
import { sumarDias } from "./fechas";

export { lunesDe, sumarDias } from "./fechas";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface Trabajador {
  id: string;
  empresaId: string;
  nombre: string;
  empresa: string;
  centro: string;
  zonaHoraria: string;
  config: ConfigTrabajador;
}

/** Fila completa de la bitácora (lo que necesita el panel). */
export interface FilaEvento {
  id: number;
  tipo: EventoBitacora["tipo"];
  origen: "pwa" | "kiosco" | "panel";
  hora_efectiva: string;
  hora_servidor: string;
  puede_salir: boolean | null;
  corrige_evento_id: number | null;
  diferido: boolean;
  motivo: string | null;
}

const COLUMNAS_EVENTO = "id, tipo, origen, hora_efectiva, hora_servidor, puede_salir, corrige_evento_id, diferido, motivo";
const SELECT_TRABAJADOR =
  "id, empresa_id, nombre, dia_descanso, jornada_pactada_min, empresas(razon_social), centros_trabajo(nombre, zona_horaria)";

interface FilaTrabajador {
  id: string;
  empresa_id: string;
  nombre: string;
  dia_descanso: number;
  jornada_pactada_min: unknown;
  empresas: unknown;
  centros_trabajo: unknown;
}

function filaATrabajador(t: FilaTrabajador): Trabajador {
  const centro = uno(t.centros_trabajo) as { nombre: string; zona_horaria: string } | null;
  const empresa = uno(t.empresas) as { razon_social: string } | null;
  const pactada = t.jornada_pactada_min as Record<string, number> | null;
  const config: ConfigTrabajador = { diaDescanso: t.dia_descanso as DiaSemana };
  if (pactada && Object.keys(pactada).length) {
    config.jornadaPactadaMin = Object.fromEntries(
      Object.entries(pactada).map(([d, m]) => [Number(d), m]),
    ) as ConfigTrabajador["jornadaPactadaMin"] & object;
  }
  return {
    id: t.id,
    empresaId: t.empresa_id,
    nombre: t.nombre,
    empresa: empresa?.razon_social ?? "",
    centro: centro?.nombre ?? "",
    zonaHoraria: centro?.zona_horaria ?? "America/Mexico_City",
    config,
  };
}

/** Registros de trabajador activos vinculados al usuario actual. */
export async function misTrabajadores(supabase: Cliente, userId: string): Promise<Trabajador[]> {
  const { data, error } = await supabase
    .from("trabajadores")
    .select(SELECT_TRABAJADOR)
    .eq("user_id", userId)
    .is("fecha_baja", null)
    .order("creado_en");
  if (error) throw error;
  return ((data ?? []) as FilaTrabajador[]).map(filaATrabajador);
}

/** Un trabajador por id (RLS decide si el usuario puede verlo). */
export async function trabajadorPorId(supabase: Cliente, id: string): Promise<Trabajador | null> {
  const { data, error } = await supabase.from("trabajadores").select(SELECT_TRABAJADOR).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaATrabajador(data as FilaTrabajador) : null;
}

/**
 * Carga los eventos de un trabajador en una ventana de tiempo, más todos los
 * ajustes (correcciones y anulaciones) relacionados, aunque caigan fuera de ella.
 */
export async function cargarFilasEventos(
  supabase: Cliente,
  trabajadorId: string,
  desde: Date,
  hasta: Date,
): Promise<FilaEvento[]> {
  const { data, error } = await supabase
    .from("eventos")
    .select(COLUMNAS_EVENTO)
    .eq("trabajador_id", trabajadorId)
    .gte("hora_efectiva", desde.toISOString())
    .lt("hora_efectiva", hasta.toISOString());
  if (error) throw error;

  const porId = new Map<number, FilaEvento>();
  for (const e of (data ?? []) as FilaEvento[]) porId.set(e.id, e);

  // Cierre transitivo: ajustes que apuntan a eventos cargados y eventos a los que apuntan los ajustes.
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const ids = [...porId.keys()];
    const objetivos = [...porId.values()]
      .map((e) => e.corrige_evento_id)
      .filter((id): id is number => id !== null && !porId.has(id));
    const [ajustes, faltantes] = await Promise.all([
      ids.length
        ? supabase.from("eventos").select(COLUMNAS_EVENTO).eq("trabajador_id", trabajadorId).in("corrige_evento_id", ids)
        : Promise.resolve({ data: [], error: null }),
      objetivos.length
        ? supabase.from("eventos").select(COLUMNAS_EVENTO).in("id", objetivos)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ajustes.error) throw ajustes.error;
    if (faltantes.error) throw faltantes.error;
    const antes = porId.size;
    for (const e of [...(ajustes.data ?? []), ...(faltantes.data ?? [])] as FilaEvento[]) porId.set(e.id, e);
    if (porId.size === antes) break;
  }

  return [...porId.values()].sort((a, b) => a.id - b.id);
}

export function filaAEvento(e: FilaEvento): EventoBitacora {
  return {
    id: e.id,
    tipo: e.tipo,
    horaEfectiva: e.hora_efectiva,
    puedeSalir: e.puede_salir,
    corrigeEventoId: e.corrige_evento_id,
    diferido: e.diferido,
  };
}

export async function cargarEventos(supabase: Cliente, trabajadorId: string, desde: Date, hasta: Date) {
  return (await cargarFilasEventos(supabase, trabajadorId, desde, hasta)).map(filaAEvento);
}

export interface SemanaTrabajador {
  filas: FilaEvento[];
  semana: ResultadoSemana;
  reconstruccion: Reconstruccion;
  eventoIds: (number | string)[];
}

/** Reconstruye y calcula la semana (lunes a domingo) que inicia en `lunes`. */
export async function semanaDeTrabajador(
  supabase: Cliente,
  trabajador: Trabajador,
  lunes: string,
): Promise<SemanaTrabajador> {
  // Margen de 2 días para turnos y zonas horarias en los bordes de la semana.
  const desde = new Date(`${lunes}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 2);
  const hasta = new Date(`${lunes}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + 9);

  const filas = await cargarFilasEventos(supabase, trabajador.id, desde, hasta);
  const reconstruccion = reconstruirTurnos(filas.map(filaAEvento), trabajador.zonaHoraria);
  const domingoSiguiente = sumarDias(lunes, 7);
  const turnos = reconstruccion.turnos.filter((t) => {
    const f = t.inicio.slice(0, 10);
    return f >= lunes && f < domingoSiguiente;
  });
  const semana = calcularSemana(lunes, turnos, trabajador.config);
  return {
    filas,
    semana,
    reconstruccion: { ...reconstruccion, turnos },
    eventoIds: turnos.flatMap((t) => t.eventoIds),
  };
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
