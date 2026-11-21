import "server-only";

import { redirect } from "next/navigation";
import { aHoraLocal, programadoDe, reconstruirTurnos, retardoDe, type EstadoTrabajador } from "@checador/jornada";
import { filaAEvento, type FilaEvento } from "./datos";
import { aHorario, horarioEfectivo } from "./horarios";
import { horariosDeEmpresa } from "./horariosDatos";
import { crearClienteServidor, usuarioActual } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;
export type RolPanel = "propietario" | "admin" | "supervisor";

export interface ContextoPanel {
  supabase: Cliente;
  userId: string;
  rol: RolPanel;
  empresa: { id: string; razonSocial: string; rfc: string | null; zonaHoraria: string };
}

/** Membresías del usuario (sin incluir kiosco). */
export async function membresiaPanel(supabase: Cliente, userId: string) {
  const { data, error } = await supabase
    .from("miembros")
    .select("rol, empresas(id, razon_social, rfc, zona_horaria)")
    .eq("user_id", userId)
    .in("rol", ["propietario", "admin", "supervisor"])
    .order("creado_en")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const e = (Array.isArray(data.empresas) ? data.empresas[0] : data.empresas) as {
    id: string;
    razon_social: string;
    rfc: string | null;
    zona_horaria: string;
  };
  return {
    rol: data.rol as RolPanel,
    empresa: { id: e.id, razonSocial: e.razon_social, rfc: e.rfc, zonaHoraria: e.zona_horaria },
  };
}

/**
 * Contexto obligatorio para las páginas y acciones del panel.
 * Sin sesión → /entrar. Sin empresa → alta de empresa.
 */
export async function requierePanel(): Promise<ContextoPanel> {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/panel");
  const m = await membresiaPanel(supabase, userId);
  if (!m) redirect("/alta-empresa");
  return { supabase, userId, ...m };
}

export const esGestor = (rol: RolPanel) => rol === "propietario" || rol === "admin";

export interface Presente {
  trabajadorId: string;
  nombre: string;
  estado: EstadoTrabajador;
  desde: string | null;
}

/** Quién está trabajando o en pausa ahora (eventos de las últimas 36 h). */
export async function presentesAhora(ctx: ContextoPanel): Promise<Presente[]> {
  const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
  const [{ data: trabajadores }, { data: eventos, error }] = await Promise.all([
    ctx.supabase
      .from("trabajadores")
      .select("id, nombre, centros_trabajo(zona_horaria)")
      .eq("empresa_id", ctx.empresa.id)
      .is("fecha_baja", null),
    ctx.supabase
      .from("eventos")
      .select("id, trabajador_id, tipo, origen, hora_efectiva, hora_servidor, puede_salir, corrige_evento_id, diferido, motivo")
      .eq("empresa_id", ctx.empresa.id)
      .or(`hora_efectiva.gte.${desde},hora_servidor.gte.${desde}`)
      .order("id"),
  ]);
  if (error) throw error;

  const porTrabajador = new Map<string, FilaEvento[]>();
  for (const e of (eventos ?? []) as (FilaEvento & { trabajador_id: string })[]) {
    porTrabajador.set(e.trabajador_id, [...(porTrabajador.get(e.trabajador_id) ?? []), e]);
  }

  const presentes: Presente[] = [];
  for (const t of trabajadores ?? []) {
    const filas = porTrabajador.get(t.id);
    if (!filas) continue;
    const centro = (Array.isArray(t.centros_trabajo) ? t.centros_trabajo[0] : t.centros_trabajo) as
      | { zona_horaria: string }
      | null;
    const r = reconstruirTurnos(filas.map(filaAEvento), centro?.zona_horaria ?? ctx.empresa.zonaHoraria);
    if (r.estado !== "fuera") {
      presentes.push({ trabajadorId: t.id, nombre: t.nombre, estado: r.estado, desde: r.enCurso?.inicio ?? null });
    }
  }
  return presentes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export interface HorarioDeHoy {
  /** Hay al menos una persona activa con horario (si no, el tablero no muestra la sección). */
  conHorario: number;
  tarde: { trabajadorId: string; nombre: string; entrada: string; minutos: number }[];
  sinEntrada: { trabajadorId: string; nombre: string; programada: string }[];
}

/**
 * Frente al horario de hoy: quién entró tarde y quién aún no checa entrada aunque su turno ya
 * empezó (más la tolerancia). Informativo: puede ser una falta, un permiso o una checada olvidada.
 */
export async function horarioDeHoy(ctx: ContextoPanel): Promise<HorarioDeHoy> {
  const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
  const [{ horarios, predeterminado }, { data: trabajadores }, { data: eventos, error }] = await Promise.all([
    horariosDeEmpresa(ctx.supabase, ctx.empresa.id),
    ctx.supabase
      .from("trabajadores")
      .select("id, nombre, horario_id, sin_horario_fijo, centros_trabajo(zona_horaria)")
      .eq("empresa_id", ctx.empresa.id)
      .is("fecha_baja", null),
    ctx.supabase
      .from("eventos")
      .select("id, trabajador_id, tipo, origen, hora_efectiva, hora_servidor, puede_salir, corrige_evento_id, diferido, motivo")
      .eq("empresa_id", ctx.empresa.id)
      .or(`hora_efectiva.gte.${desde},hora_servidor.gte.${desde}`)
      .order("id"),
  ]);
  if (error) throw error;
  const resultado: HorarioDeHoy = { conHorario: 0, tarde: [], sinEntrada: [] };
  if (!horarios.length) return resultado;

  const porTrabajador = new Map<string, FilaEvento[]>();
  for (const e of (eventos ?? []) as (FilaEvento & { trabajador_id: string })[]) {
    porTrabajador.set(e.trabajador_id, [...(porTrabajador.get(e.trabajador_id) ?? []), e]);
  }
  for (const t of trabajadores ?? []) {
    const fila = horarioEfectivo(t, horarios, predeterminado);
    if (!fila) continue;
    resultado.conHorario++;
    const centro = (Array.isArray(t.centros_trabajo) ? t.centros_trabajo[0] : t.centros_trabajo) as { zona_horaria: string } | null;
    const zona = centro?.zona_horaria ?? ctx.empresa.zonaHoraria;
    const ahora = aHoraLocal(new Date(), zona);
    const horario = aHorario(fila);
    const prog = programadoDe(horario, ahora.slice(0, 10));
    if (!prog) continue;
    const r = reconstruirTurnos((porTrabajador.get(t.id) ?? []).map(filaAEvento), zona);
    // Entrada de hoy: el primer turno que empieza desde 3 h antes del horario hasta su fin.
    const inicios = [...r.turnos.map((x) => x.inicio), ...(r.enCurso ? [r.enCurso.inicio] : [])]
      .filter((i) => i >= sumarMinutos(prog.inicio, -180) && i <= prog.fin)
      .sort();
    const entrada = inicios[0];
    if (entrada) {
      const minutos = retardoDe(horario, entrada);
      if (minutos > 0) resultado.tarde.push({ trabajadorId: t.id, nombre: t.nombre, entrada: entrada.slice(11), minutos });
    } else if (ahora > sumarMinutos(prog.inicio, horario.toleranciaMin) && ahora < prog.fin) {
      resultado.sinEntrada.push({ trabajadorId: t.id, nombre: t.nombre, programada: prog.inicio.slice(11) });
    }
  }
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");
  resultado.tarde.sort(porNombre);
  resultado.sinEntrada.sort(porNombre);
  return resultado;
}

/** "YYYY-MM-DDTHH:mm" + minutos (reloj de pared). */
const sumarMinutos = (local: string, min: number) => new Date(Date.parse(`${local}:00Z`) + min * 60_000).toISOString().slice(0, 16);

export interface Objecion {
  trabajadorId: string;
  nombre: string;
  semana: string;
  comentario: string;
  respondidoEn: string;
}

/** Semanas objetadas que el trabajador no ha vuelto a confirmar. */
export async function objecionesPendientes(ctx: ContextoPanel): Promise<Objecion[]> {
  const { data, error } = await ctx.supabase
    .from("conformidades")
    .select("trabajador_id, periodo_inicio, respuesta, comentario, respondido_en, trabajadores(nombre)")
    .eq("empresa_id", ctx.empresa.id)
    .order("respondido_en", { ascending: false })
    .limit(500);
  if (error) throw error;

  const ultima = new Map<string, (typeof data)[number]>();
  for (const c of data ?? []) {
    const clave = `${c.trabajador_id}|${c.periodo_inicio}`;
    if (!ultima.has(clave)) ultima.set(clave, c);
  }
  return [...ultima.values()]
    .filter((c) => c.respuesta === "objeta")
    .map((c) => ({
      trabajadorId: c.trabajador_id,
      nombre: ((Array.isArray(c.trabajadores) ? c.trabajadores[0] : c.trabajadores) as { nombre: string } | null)?.nombre ?? "",
      semana: c.periodo_inicio,
      comentario: c.comentario ?? "",
      respondidoEn: c.respondido_en,
    }));
}

export const ZONAS_MX: { zona: string; etiqueta: string }[] = [
  { zona: "America/Mexico_City", etiqueta: "Centro (CDMX, Guadalajara, Monterrey)" },
  { zona: "America/Cancun", etiqueta: "Sureste (Quintana Roo)" },
  { zona: "America/Mazatlan", etiqueta: "Pacífico (Sinaloa, Nayarit, BCS)" },
  { zona: "America/Hermosillo", etiqueta: "Sonora" },
  { zona: "America/Chihuahua", etiqueta: "Chihuahua" },
  { zona: "America/Ciudad_Juarez", etiqueta: "Ciudad Juárez (horario de verano)" },
  { zona: "America/Matamoros", etiqueta: "Frontera noreste (horario de verano)" },
  { zona: "America/Tijuana", etiqueta: "Noroeste (Baja California, horario de verano)" },
];
