"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { aHoraLocal, localAInstante } from "@checador/jornada";
import { generarTextoAcuerdo } from "@/lib/acuerdo";
import { datosActuales } from "@/lib/acuerdosDatos";
import { trabajadorPorId } from "@/lib/datos";
import { requierePanel } from "@/lib/panel";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

/**
 * Acciones del panel del empleador. Cada acción es un endpoint público: se
 * vuelve a verificar la sesión, y la autorización final la imponen las
 * políticas RLS y las funciones de la base.
 */

export type Estado = { ok: boolean; mensaje: string } | null;

const ok = (mensaje: string): Estado => ({ ok: true, mensaje });
const fallo = (mensaje: string): Estado => ({ ok: false, mensaje });
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function traducir(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (error.message.includes("numero_empleado")) return "Ya existe un trabajador con ese número de empleado.";
    if (error.message.includes("email")) return "Ese correo ya está registrado o tiene una invitación pendiente.";
    return "Ese registro ya existe.";
  }
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  if (error.code === "23514") {
    if (error.message.includes("rfc")) return "El RFC no tiene un formato válido.";
    if (error.message.includes("curp")) return "La CURP no tiene un formato válido.";
    if (error.message.includes("email")) return "El correo no tiene un formato válido.";
    return error.message;
  }
  return error.message;
}

const refrescar = () => revalidatePath("/panel", "layout");

// --- Alta de empresa ----------------------------------------------------------

export async function crearEmpresa(_: Estado, fd: FormData): Promise<Estado> {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) redirect("/entrar?siguiente=/alta-empresa");

  const razon = texto(fd, "razon_social");
  const rfc = texto(fd, "rfc").toUpperCase() || null;
  const centro = texto(fd, "centro") || "Matriz";
  const zona = texto(fd, "zona_horaria") || "America/Mexico_City";
  if (!razon) return fallo("Escribe la razón social o nombre del negocio.");

  const { data: empresaId, error } = await supabase.rpc("crear_empresa", { p_razon_social: razon, p_rfc: rfc });
  if (error) return fallo(traducir(error));
  const [r1, r2] = await Promise.all([
    supabase.from("empresas").update({ zona_horaria: zona }).eq("id", empresaId),
    supabase.from("centros_trabajo").insert({ empresa_id: empresaId, nombre: centro, zona_horaria: zona }),
  ]);
  if (r1.error) return fallo(traducir(r1.error));
  if (r2.error) return fallo(traducir(r2.error));
  redirect("/panel");
}

// --- Centros de trabajo -----------------------------------------------------------

export async function guardarCentro(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const id = texto(fd, "id");
  const datos = {
    nombre: texto(fd, "nombre"),
    direccion: texto(fd, "direccion") || null,
    zona_horaria: texto(fd, "zona_horaria") || ctx.empresa.zonaHoraria,
    pausa_puede_salir: fd.get("pausa_puede_salir") === "on",
  };
  if (!datos.nombre) return fallo("El centro necesita un nombre.");
  const { error } = id
    ? await ctx.supabase.from("centros_trabajo").update(datos).eq("id", id).eq("empresa_id", ctx.empresa.id)
    : await ctx.supabase.from("centros_trabajo").insert({ ...datos, empresa_id: ctx.empresa.id });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok(id ? "Centro actualizado." : "Centro creado.");
}

// --- Trabajadores -------------------------------------------------------------------

export async function guardarTrabajador(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const id = texto(fd, "id");
  const pactada: Record<string, number> = {};
  for (let d = 0; d < 7; d++) {
    const h = texto(fd, `pactada_${d}`);
    if (h === "") continue;
    const min = Math.round(Number(h.replace(",", ".")) * 60);
    if (!Number.isFinite(min) || min < 0 || min > 12 * 60) return fallo("La jornada pactada por día debe estar entre 0 y 12 horas.");
    pactada[String(d)] = min;
  }
  const datos = {
    nombre: texto(fd, "nombre"),
    numero_empleado: texto(fd, "numero_empleado") || null,
    email: texto(fd, "email").toLowerCase() || null,
    curp: texto(fd, "curp").toUpperCase() || null,
    centro_trabajo_id: texto(fd, "centro_trabajo_id"),
    fecha_ingreso: texto(fd, "fecha_ingreso"),
    dia_descanso: Number(texto(fd, "dia_descanso") || 0),
    jornada_pactada_min: Object.keys(pactada).length ? pactada : null,
  };
  if (!datos.nombre) return fallo("Escribe el nombre del trabajador.");
  if (!datos.centro_trabajo_id) return fallo("Elige el centro de trabajo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_ingreso)) return fallo("Indica la fecha de ingreso.");
  if (datos.numero_empleado && !/^[0-9A-Za-z-]{1,20}$/.test(datos.numero_empleado)) {
    return fallo("El número de empleado solo puede tener letras, números y guiones (máx. 20).");
  }

  if (id) {
    const { error } = await ctx.supabase.from("trabajadores").update(datos).eq("id", id).eq("empresa_id", ctx.empresa.id);
    if (error) return fallo(traducir(error));
    refrescar();
    return ok("Datos actualizados.");
  }
  const { data, error } = await ctx.supabase
    .from("trabajadores")
    .insert({ ...datos, empresa_id: ctx.empresa.id })
    .select("id")
    .single();
  if (error) return fallo(traducir(error));
  refrescar();
  redirect(`/panel/trabajadores/${data.id}`);
}

export async function asignarPin(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const pin = texto(fd, "pin");
  const { error } = await ctx.supabase.rpc("asignar_pin", { p_trabajador: texto(fd, "trabajador_id"), p_pin: pin });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("PIN asignado. Entrégalo al trabajador en persona.");
}

export async function darDeBaja(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const fecha = texto(fd, "fecha_baja");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fallo("Indica la fecha de baja.");
  if (texto(fd, "confirmar") !== "BAJA") return fallo('Escribe BAJA para confirmar.');
  const { error } = await ctx.supabase
    .from("trabajadores")
    .update({ fecha_baja: fecha })
    .eq("id", texto(fd, "trabajador_id"))
    .eq("empresa_id", ctx.empresa.id);
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("Baja registrada. Sus registros se conservan (art. 804 LFT).");
}

// --- Bitácora: checadas del panel ---------------------------------------------------

const TIPOS_CAPTURA = new Set(["entrada", "salida", "inicio_pausa", "fin_pausa"]);

async function contextoTrabajador(fd: FormData) {
  const ctx = await requierePanel();
  const trabajador = await trabajadorPorId(ctx.supabase, texto(fd, "trabajador_id"));
  if (!trabajador || trabajador.empresaId !== ctx.empresa.id) return null;
  return { ctx, trabajador };
}

function validarHora(hora: string, zona: string): Date | string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(hora)) return "Indica fecha y hora.";
  const instante = localAInstante(hora, zona);
  if (instante.getTime() > Date.now()) return "La hora no puede ser futura.";
  return instante;
}

export async function agregarChecada(_: Estado, fd: FormData): Promise<Estado> {
  const c = await contextoTrabajador(fd);
  if (!c) return fallo("Trabajador no encontrado.");
  const tipo = texto(fd, "tipo");
  const motivo = texto(fd, "motivo");
  if (!TIPOS_CAPTURA.has(tipo)) return fallo("Tipo de checada inválido.");
  if (!motivo) return fallo("El motivo es obligatorio: queda en la bitácora.");
  const hora = validarHora(texto(fd, "hora"), c.trabajador.zonaHoraria);
  if (typeof hora === "string") return fallo(hora);

  const { error } = await c.ctx.supabase.from("eventos").insert({
    empresa_id: c.ctx.empresa.id,
    trabajador_id: c.trabajador.id,
    tipo,
    origen: "panel",
    motivo,
    hora_efectiva: hora.toISOString(),
    ...(tipo === "inicio_pausa" ? { puede_salir: fd.get("puede_salir") === "on" } : {}),
  });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("Checada agregada a la bitácora.");
}

export async function corregirChecada(_: Estado, fd: FormData): Promise<Estado> {
  const c = await contextoTrabajador(fd);
  if (!c) return fallo("Trabajador no encontrado.");
  const motivo = texto(fd, "motivo");
  if (!motivo) return fallo("El motivo es obligatorio: queda en la bitácora.");
  const hora = validarHora(texto(fd, "hora"), c.trabajador.zonaHoraria);
  if (typeof hora === "string") return fallo(hora);

  const { error } = await c.ctx.supabase.from("eventos").insert({
    empresa_id: c.ctx.empresa.id,
    trabajador_id: c.trabajador.id,
    tipo: "correccion",
    origen: "panel",
    corrige_evento_id: Number(texto(fd, "evento_id")),
    motivo,
    hora_efectiva: hora.toISOString(),
  });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("Corrección registrada. El registro original se conserva.");
}

export async function anularChecada(_: Estado, fd: FormData): Promise<Estado> {
  const c = await contextoTrabajador(fd);
  if (!c) return fallo("Trabajador no encontrado.");
  const motivo = texto(fd, "motivo");
  if (!motivo) return fallo("El motivo es obligatorio: queda en la bitácora.");
  const { error } = await c.ctx.supabase.from("eventos").insert({
    empresa_id: c.ctx.empresa.id,
    trabajador_id: c.trabajador.id,
    tipo: "anulacion",
    origen: "panel",
    corrige_evento_id: Number(texto(fd, "evento_id")),
    motivo,
  });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("Checada anulada. El registro original se conserva.");
}

// --- Accesos -------------------------------------------------------------------------

export async function invitar(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const rol = texto(fd, "rol");
  const centro = texto(fd, "centro_trabajo_id");
  if (!["admin", "supervisor", "kiosco"].includes(rol)) return fallo("Rol inválido.");
  const { error } = await ctx.supabase.from("invitaciones").insert({
    empresa_id: ctx.empresa.id,
    email: texto(fd, "email").toLowerCase(),
    rol,
    centro_trabajo_id: rol === "kiosco" && centro ? centro : null,
  });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("Invitación creada. Esa persona (o dispositivo) debe entrar con ese correo.");
}

export async function cancelarInvitacion(fd: FormData) {
  const ctx = await requierePanel();
  await ctx.supabase.from("invitaciones").delete().eq("id", texto(fd, "id")).eq("empresa_id", ctx.empresa.id);
  refrescar();
}

export async function quitarAcceso(fd: FormData) {
  const ctx = await requierePanel();
  await ctx.supabase.from("miembros").delete().eq("user_id", texto(fd, "user_id")).eq("empresa_id", ctx.empresa.id);
  refrescar();
}

// --- Integridad --------------------------------------------------------------------------

export async function verificarIntegridad(_: Estado): Promise<Estado> {
  const ctx = await requierePanel();
  const { data, error } = await ctx.supabase.rpc("verificar_cadena", { p_empresa: ctx.empresa.id });
  if (error) return fallo(traducir(error));
  return data === null
    ? ok("La bitácora está íntegra: ningún registro ha sido alterado.")
    : fallo(`ALERTA: la bitácora fue alterada a partir del registro n.º ${data}. Contacta a soporte.`);
}

// --- Acuerdo de registro electrónico (art. 132 XXXIV) -------------------------------------

/** Genera la siguiente versión del acuerdo con los datos actuales y la firma como empleador. */
export async function generarYFirmarAcuerdo(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const trabajadorId = texto(fd, "trabajador_id");
  const datos = await datosActuales(ctx.supabase, trabajadorId);
  if (!datos || datos.empresaId !== ctx.empresa.id) return fallo("Trabajador no encontrado.");
  if (fd.get("confirmo") !== "on") return fallo("Confirma que revisaste el texto del acuerdo.");

  const { data: ultima } = await ctx.supabase
    .from("acuerdos").select("version").eq("trabajador_id", trabajadorId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (ultima?.version ?? 0) + 1;
  const hoy = aHoraLocal(new Date(), datos.zonaHoraria).slice(0, 10);
  const contenido = generarTextoAcuerdo(datos.base(version, hoy));

  const { data: acuerdo, error } = await ctx.supabase
    .from("acuerdos")
    .insert({
      empresa_id: ctx.empresa.id,
      trabajador_id: trabajadorId,
      version,
      contenido,
      dia_descanso: datos.diaDescanso,
      jornada_pactada_min: datos.jornadaPactadaMin,
    })
    .select("id")
    .single();
  if (error) return fallo(traducir(error));
  const { error: errFirma } = await ctx.supabase
    .from("firmas_acuerdo")
    .insert({ empresa_id: ctx.empresa.id, acuerdo_id: acuerdo.id, firmante: "empleador", evidencia: await evidenciaAccion() });
  if (errFirma) return fallo(traducir(errFirma));
  refrescar();
  return ok(`Acuerdo v${version} firmado por la empresa. Falta la firma de la persona trabajadora.`);
}

/** Registra que la persona trabajadora firmó en papel el acuerdo pendiente. */
export async function registrarFirmaAutografa(_: Estado, fd: FormData): Promise<Estado> {
  const ctx = await requierePanel();
  const resguardo = texto(fd, "resguardo");
  const fecha = texto(fd, "fecha_firma");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fallo("Indica la fecha en que se firmó.");
  if (!resguardo) return fallo("Indica dónde se resguarda el original firmado.");
  if (fd.get("confirmo") !== "on") return fallo("Confirma que el papel firmado tiene el mismo folio.");
  const { error } = await ctx.supabase.from("firmas_acuerdo").insert({
    empresa_id: ctx.empresa.id,
    acuerdo_id: texto(fd, "acuerdo_id"),
    firmante: "trabajador",
    modalidad: "autografa",
    evidencia: { ...(await evidenciaAccion()), resguardo, fecha_firma: fecha },
  });
  if (error) return fallo(traducir(error));
  refrescar();
  return ok("Firma autógrafa registrada. El acuerdo queda vigente.");
}

/** IP y agente de usuario de la petición de la Server Action. */
async function evidenciaAccion() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    agente: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}
