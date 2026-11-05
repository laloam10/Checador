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

/** Datos actuales del trabajador para generar el texto (siempre desde la base, nunca desde el navegador). */
export async function datosActuales(supabase: Cliente, trabajadorId: string) {
  const { data, error } = await supabase
    .from("trabajadores")
    .select(
      "id, empresa_id, nombre, numero_empleado, curp, email, dia_descanso, jornada_pactada_min, empresas(razon_social, rfc), centros_trabajo(nombre, direccion, pausa_puede_salir, zona_horaria)",
    )
    .eq("id", trabajadorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const e = (Array.isArray(data.empresas) ? data.empresas[0] : data.empresas) as { razon_social: string; rfc: string | null };
  const c = (Array.isArray(data.centros_trabajo) ? data.centros_trabajo[0] : data.centros_trabajo) as {
    nombre: string;
    direccion: string | null;
    pausa_puede_salir: boolean;
    zona_horaria: string;
  };
  return {
    empresaId: data.empresa_id as string,
    zonaHoraria: c.zona_horaria,
    diaDescanso: data.dia_descanso as number,
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
        jornadaPactadaMin: data.jornada_pactada_min as Record<string, number> | null,
      },
    }),
  };
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

export async function estadoAcuerdo(supabase: Cliente, trabajadorId: string): Promise<EstadoAcuerdo & { textoPropuesto: string | null }> {
  const [lista, datos] = await Promise.all([acuerdosDe(supabase, trabajadorId), datosActuales(supabase, trabajadorId)]);
  const vigente = lista.find((a) => firmaDe(a, "empleador") && firmaDe(a, "trabajador")) ?? null;
  const pendiente =
    lista.find((a) => firmaDe(a, "empleador") && !firmaDe(a, "trabajador") && a.version > (vigente?.version ?? 0)) ?? null;
  const siguienteVersion = (lista[0]?.version ?? 0) + 1;
  if (!datos) return { vigente, pendiente, desactualizado: false, siguienteVersion, textoPropuesto: null };

  // ¿El vigente sigue reflejando los datos actuales? Se regenera con su misma versión y fecha y se compara.
  const referencia = pendiente ?? vigente;
  const desactualizado = referencia
    ? generarTextoAcuerdo(datos.base(referencia.version, aHoraLocal(referencia.creado_en, datos.zonaHoraria).slice(0, 10))) !==
      referencia.contenido
    : true;
  const hoy = aHoraLocal(new Date(), datos.zonaHoraria).slice(0, 10);
  return {
    vigente,
    pendiente,
    desactualizado,
    siguienteVersion,
    textoPropuesto: generarTextoAcuerdo(datos.base(siguienteVersion, hoy)),
  };
}
