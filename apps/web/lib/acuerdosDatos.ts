import "server-only";

import { aHoraLocal } from "@checador/jornada";
import { generarTextoAcuerdo, type DatosAcuerdo } from "./acuerdo";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface Firma {
  firmante: "empleador" | "trabajador";
  modalidad: "electronica" | "pin_kiosco" | "autografa";
  firmado_en: string;
  user_id: string;
  evidencia: Record<string, unknown>;
}

export interface Acuerdo {
  id: string;
  empresa_id: string;
  trabajador_id: string;
  version: number;
  contenido: string;
  contenido_hash: string;
  creado_en: string;
  firmas: Firma[];
}

export const MODALIDAD: Record<Firma["modalidad"], string> = {
  electronica: "firma electrónica (cuenta verificada)",
  pin_kiosco: "PIN en el kiosco",
  autografa: "firma autógrafa en papel",
};

const SELECT_DATOS =
  "id, empresa_id, nombre, numero_empleado, curp, email, dia_descanso, dias_descanso_adicionales, jornada_pactada_min, empresas(razon_social, rfc), centros_trabajo(nombre, direccion, pausa_puede_salir, zona_horaria)";

type FilaDatos = {
  id: string;
  empresa_id: string;
  nombre: string;
  numero_empleado: string | null;
  curp: string | null;
  email: string | null;
  dia_descanso: number;
  dias_descanso_adicionales: number[] | null;
  jornada_pactada_min: unknown;
  empresas: unknown;
  centros_trabajo: unknown;
};

/** Convierte una fila de trabajador en los datos con que se genera el texto del acuerdo. */
function construirDatos(data: FilaDatos) {
  const e = (Array.isArray(data.empresas) ? data.empresas[0] : data.empresas) as { razon_social: string; rfc: string | null };
  const c = (Array.isArray(data.centros_trabajo) ? data.centros_trabajo[0] : data.centros_trabajo) as {
    nombre: string;
    direccion: string | null;
    pausa_puede_salir: boolean;
    zona_horaria: string;
  };
  return {
    trabajadorId: data.id,
    nombre: data.nombre,
    numeroEmpleado: data.numero_empleado,
    email: data.email,
    empresaId: data.empresa_id,
    zonaHoraria: c.zona_horaria,
    diaDescanso: data.dia_descanso,
    diasDescansoAdicionales: data.dias_descanso_adicionales ?? [],
    jornadaPactadaMin: data.jornada_pactada_min as Record<string, number> | null,
    base: (version: number, fecha: string): DatosAcuerdo => ({
      version,
      fecha,
      empresa: { razonSocial: e.razon_social, rfc: e.rfc },
      centro: { nombre: c.nombre, direccion: c.direccion, pausaPuedeSalir: c.pausa_puede_salir },
      trabajador: {
        nombre: data.nombre,
        numeroEmpleado: data.numero_empleado,
        curp: data.curp,
        email: data.email,
        diaDescanso: data.dia_descanso,
        diasDescansoAdicionales: data.dias_descanso_adicionales ?? [],
        jornadaPactadaMin: data.jornada_pactada_min as Record<string, number> | null,
      },
    }),
  };
}
type Datos = ReturnType<typeof construirDatos>;

/** Datos actuales del trabajador para generar el texto (siempre desde la base, nunca desde el navegador). */
export async function datosActuales(supabase: Cliente, trabajadorId: string) {
  const { data, error } = await supabase.from("trabajadores").select(SELECT_DATOS).eq("id", trabajadorId).maybeSingle();
  if (error) throw error;
  return data ? construirDatos(data as FilaDatos) : null;
}

export async function acuerdosDe(supabase: Cliente, trabajadorId: string): Promise<Acuerdo[]> {
  const { data, error } = await supabase
    .from("acuerdos")
    .select("id, empresa_id, trabajador_id, version, contenido, contenido_hash, creado_en, firmas_acuerdo(firmante, modalidad, firmado_en, user_id, evidencia)")
    .eq("trabajador_id", trabajadorId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a) => ({ ...a, firmas: (a.firmas_acuerdo ?? []) as Firma[] })) as Acuerdo[];
}

export const firmaDe = (a: Acuerdo, quien: Firma["firmante"]) => a.firmas.find((f) => f.firmante === quien) ?? null;

export interface EstadoAcuerdo {
  vigente: Acuerdo | null;
  pendiente: Acuerdo | null;
  /** El texto que se generaría hoy difiere del vigente (cambió la jornada, el método, el centro o la plantilla). */
  desactualizado: boolean;
  siguienteVersion: number;
}

/** Reglas de estado (compartidas por la ficha individual y el resumen de la empresa). */
function evaluar(lista: Acuerdo[], datos: Datos | null): EstadoAcuerdo {
  const vigente = lista.find((a) => firmaDe(a, "empleador") && firmaDe(a, "trabajador")) ?? null;
  const pendiente =
    lista.find((a) => firmaDe(a, "empleador") && !firmaDe(a, "trabajador") && a.version > (vigente?.version ?? 0)) ?? null;
  const siguienteVersion = Math.max(0, ...lista.map((a) => a.version)) + 1;
  if (!datos) return { vigente, pendiente, desactualizado: false, siguienteVersion };
  // ¿El último acuerdo sigue reflejando los datos actuales? Se regenera con su misma versión y fecha y se compara.
  const referencia = pendiente ?? vigente;
  const desactualizado = referencia
    ? generarTextoAcuerdo(datos.base(referencia.version, aHoraLocal(referencia.creado_en, datos.zonaHoraria).slice(0, 10))) !==
      referencia.contenido
    : true;
  return { vigente, pendiente, desactualizado, siguienteVersion };
}

export async function estadoAcuerdo(supabase: Cliente, trabajadorId: string): Promise<EstadoAcuerdo & { textoPropuesto: string | null }> {
  const [lista, datos] = await Promise.all([acuerdosDe(supabase, trabajadorId), datosActuales(supabase, trabajadorId)]);
  const e = evaluar(lista, datos);
  const textoPropuesto = datos
    ? generarTextoAcuerdo(datos.base(e.siguienteVersion, aHoraLocal(new Date(), datos.zonaHoraria).slice(0, 10)))
    : null;
  return { ...e, textoPropuesto };
}

export type ClaveEstado = "vigente" | "pendiente" | "desactualizado" | "sin_acuerdo";

export interface EstadoTrabajador {
  trabajadorId: string;
  nombre: string;
  numeroEmpleado: string | null;
  email: string | null;
  clave: ClaveEstado;
  version: number | null;
}

/**
 * Estado del acuerdo de todos los trabajadores activos de la empresa, con dos consultas.
 * "desactualizado" significa que hay acuerdo (vigente o pendiente) pero ya no refleja los datos actuales.
 */
export async function estadosAcuerdosEmpresa(supabase: Cliente, empresaId: string): Promise<EstadoTrabajador[]> {
  const [{ data: trabajadores, error: e1 }, { data: acuerdos, error: e2 }] = await Promise.all([
    supabase.from("trabajadores").select(SELECT_DATOS).eq("empresa_id", empresaId).is("fecha_baja", null).order("nombre"),
    supabase
      .from("acuerdos")
      .select("id, empresa_id, trabajador_id, version, contenido, contenido_hash, creado_en, firmas_acuerdo(firmante, modalidad, firmado_en, user_id, evidencia)")
      .eq("empresa_id", empresaId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const porTrabajador = new Map<string, Acuerdo[]>();
  for (const a of acuerdos ?? []) {
    const ac = { ...a, firmas: (a.firmas_acuerdo ?? []) as Firma[] } as unknown as Acuerdo;
    porTrabajador.set(ac.trabajador_id, [...(porTrabajador.get(ac.trabajador_id) ?? []), ac]);
  }
  return ((trabajadores ?? []) as FilaDatos[]).map((t) => {
    const datos = construirDatos(t);
    const lista = (porTrabajador.get(t.id) ?? []).sort((a, b) => b.version - a.version);
    const e = evaluar(lista, datos);
    const clave: ClaveEstado = !e.vigente && !e.pendiente ? "sin_acuerdo" : e.desactualizado ? "desactualizado" : e.pendiente ? "pendiente" : "vigente";
    return {
      trabajadorId: t.id,
      nombre: t.nombre,
      numeroEmpleado: t.numero_empleado,
      email: t.email,
      clave,
      version: (e.pendiente ?? e.vigente)?.version ?? null,
    };
  });
}
