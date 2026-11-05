import "server-only";

import { createHash } from "node:crypto";
import {
  aHoraLocal,
  calcularSemana,
  reconstruirTurnos,
  type Incidencia,
  type ResultadoSemana,
  type TurnoReconstruido,
} from "@checador/jornada";
import { folio } from "./acuerdo";
import { acuerdosDe, firmaDe, MODALIDAD } from "./acuerdosDatos";
import { cargarFilasEventos, filaAEvento, trabajadorPorId, type FilaEvento, type Trabajador } from "./datos";
import { sumarDias } from "./fechas";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface FilaEventoExport extends FilaEvento {
  secuencia: number;
  hash: string;
  hora_dispositivo: string | null;
}

export interface SemanaExport {
  lunes: string;
  resultado: ResultadoSemana;
  turnos: TurnoReconstruido[];
  conformidad: { respuesta: string; comentario: string | null; respondido_en: string; cadena_secuencia: number } | null;
  acuerdo: string | null; // "v2 (folio …)" vigente al cierre de la semana
}

export interface DatosTrabajadorExport {
  trabajador: Trabajador;
  ficha: {
    numero: string | null;
    curp: string | null;
    fechaIngreso: string;
    fechaBaja: string | null;
  };
  acuerdos: { version: number; folio: string; vigenteDesde: string | null; firmas: string[] }[];
  semanas: SemanaExport[];
  bitacora: FilaEventoExport[];
  incidencias: Incidencia[];
}

export const sha256 = (datos: string | Uint8Array) => createHash("sha256").update(datos).digest("hex");

/** Arma todo lo necesario para exportar a un trabajador en un periodo de semanas completas. */
export async function datosTrabajador(
  supabase: Cliente,
  trabajadorId: string,
  lunesInicio: string,
  domingoFin: string,
): Promise<DatosTrabajadorExport | null> {
  const trabajador = await trabajadorPorId(supabase, trabajadorId);
  if (!trabajador) return null;
  const zona = trabajador.zonaHoraria;

  const desde = new Date(`${lunesInicio}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 2);
  const hasta = new Date(`${domingoFin}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + 3);

  const [filas, { data: ficha }, { data: conformidades }, acuerdos] = await Promise.all([
    cargarFilasEventos<FilaEventoExport>(supabase, trabajadorId, desde, hasta, "secuencia, hash, hora_dispositivo"),
    supabase.from("trabajadores").select("numero_empleado, curp, fecha_ingreso, fecha_baja").eq("id", trabajadorId).single(),
    supabase
      .from("conformidades")
      .select("periodo_inicio, respuesta, comentario, respondido_en, cadena_secuencia")
      .eq("trabajador_id", trabajadorId)
      .gte("periodo_inicio", lunesInicio)
      .lte("periodo_inicio", domingoFin)
      .order("respondido_en", { ascending: false }),
    acuerdosDe(supabase, trabajadorId),
  ]);

  const r = reconstruirTurnos(filas.map(filaAEvento), zona);
  const enPeriodo = (local: string) => local >= lunesInicio && local <= domingoFin;

  // Fecha desde la que cada versión del acuerdo quedó firmada por ambas partes.
  const versiones = acuerdos
    .map((a) => {
      const e = firmaDe(a, "empleador");
      const t = firmaDe(a, "trabajador");
      const vigenteDesde = e && t ? aHoraLocal([e.firmado_en, t.firmado_en].sort().at(-1)!, zona).slice(0, 10) : null;
      return {
        version: a.version,
        folio: folio(a.contenido_hash),
        vigenteDesde,
        firmas: a.firmas.map(
          (f) => `${f.firmante === "empleador" ? "Empresa" : "Trabajador(a)"}: ${MODALIDAD[f.modalidad]}, ${aHoraLocal(f.firmado_en, zona).replace("T", " ")}`,
        ),
      };
    })
    .sort((a, b) => a.version - b.version);

  const semanas: SemanaExport[] = [];
  for (let lunes = lunesInicio; lunes <= domingoFin; lunes = sumarDias(lunes, 7)) {
    const domingo = sumarDias(lunes, 6);
    const turnos = r.turnos.filter((t) => t.inicio.slice(0, 10) >= lunes && t.inicio.slice(0, 10) <= domingo);
    const c = (conformidades ?? []).find((x) => x.periodo_inicio === lunes) ?? null;
    const acuerdo = [...versiones].reverse().find((v) => v.vigenteDesde && v.vigenteDesde <= domingo) ?? null;
    semanas.push({
      lunes,
      resultado: calcularSemana(lunes, turnos, trabajador.config),
      turnos,
      conformidad: c,
      acuerdo: acuerdo ? `versión ${acuerdo.version} (folio ${acuerdo.folio})` : null,
    });
  }

  // Bitácora del periodo: eventos de captura cuya hora efectiva cae en el periodo y todos sus ajustes.
  const capturas = new Set(
    filas.filter((f) => !f.corrige_evento_id && enPeriodo(aHoraLocal(f.hora_efectiva, zona).slice(0, 10))).map((f) => f.id),
  );
  const raiz = new Map<number, number>();
  for (const f of filas) {
    if (!f.corrige_evento_id) continue;
    let x = f.corrige_evento_id;
    while (raiz.has(x)) x = raiz.get(x)!;
    raiz.set(f.id, x);
  }
  const bitacora = filas
    .filter((f) => capturas.has(f.id) || capturas.has(raiz.get(f.id) ?? -1))
    .sort((a, b) => a.secuencia - b.secuencia);

  return {
    trabajador,
    ficha: {
      numero: ficha?.numero_empleado ?? null,
      curp: ficha?.curp ?? null,
      fechaIngreso: ficha?.fecha_ingreso ?? "",
      fechaBaja: ficha?.fecha_baja ?? null,
    },
    acuerdos: versiones,
    semanas,
    bitacora,
    incidencias: r.incidencias.filter((i) => capturas.has(Number(i.eventoId))),
  };
}

// --- CSV --------------------------------------------------------------------------------

const BOM = "﻿";
const campo = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const linea = (valores: unknown[]) => valores.map(campo).join(",");
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const hex = (bytea: string) => bytea.replace(/^\\x/, "");

export const ETIQUETA_TIPO: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
  correccion: "Corrección",
  anulacion: "Anulación",
};
export const ETIQUETA_ORIGEN: Record<string, string> = { pwa: "App", kiosco: "Kiosco", panel: "Panel" };

const ENCABEZADO_BITACORA = [
  "numero_empleado", "trabajador", "secuencia_cadena", "id_evento", "tipo", "origen",
  "fecha_hora_local", "hora_efectiva_utc", "hora_servidor_utc", "hora_dispositivo_utc",
  "sin_conexion", "puede_salir_en_pausa", "corrige_evento", "motivo", "hash_evento",
];

/** Bitácora completa, una fila por evento (incluidas correcciones y anulaciones). */
export function csvBitacora(lista: DatosTrabajadorExport[]): string {
  const filas = [linea(ENCABEZADO_BITACORA)];
  for (const d of lista) {
    for (const e of d.bitacora) {
      filas.push(linea([
        d.ficha.numero, d.trabajador.nombre, e.secuencia, e.id, e.tipo, e.origen,
        aHoraLocal(e.hora_efectiva, d.trabajador.zonaHoraria).replace("T", " "),
        new Date(e.hora_efectiva).toISOString(), new Date(e.hora_servidor).toISOString(),
        e.hora_dispositivo ? new Date(e.hora_dispositivo).toISOString() : "",
        e.diferido ? "si" : "no", e.puede_salir === null ? "" : e.puede_salir ? "si" : "no",
        e.corrige_evento_id ?? "", e.motivo ?? "", hex(e.hash),
      ]));
    }
  }
  return BOM + filas.join("\r\n") + "\r\n";
}

const ENCABEZADO_RESUMEN = [
  "numero_empleado", "trabajador", "semana_inicio", "fila", "fecha", "tipo_jornada",
  "trabajado_min", "ordinaria_min", "extra_doble_min", "extra_triple_min",
  "trabajado_hm", "ordinaria_hm", "extra_doble_hm", "extra_triple_hm",
  "maximo_legal_semanal_min", "alertas", "acuerdo_vigente", "conformidad",
];

/** Resumen calculado: una fila por día trabajado y una de total por semana. */
export function csvResumen(lista: DatosTrabajadorExport[]): string {
  const filas = [linea(ENCABEZADO_RESUMEN)];
  for (const d of lista) {
    for (const s of d.semanas) {
      for (const dia of s.resultado.dias) {
        filas.push(linea([
          d.ficha.numero, d.trabajador.nombre, s.lunes, "dia", dia.fecha, dia.tipo,
          dia.trabajadoMin, dia.ordinariaMin, dia.extraDobleMin, dia.extraTripleMin,
          hm(dia.trabajadoMin), hm(dia.ordinariaMin), hm(dia.extraDobleMin), hm(dia.extraTripleMin),
          "", "", "", "",
        ]));
      }
      const t = s.resultado.totales;
      filas.push(linea([
        d.ficha.numero, d.trabajador.nombre, s.lunes, "total_semana", "", "",
        t.trabajadoMin, t.ordinariaMin, t.extraDobleMin, t.extraTripleMin,
        hm(t.trabajadoMin), hm(t.ordinariaMin), hm(t.extraDobleMin), hm(t.extraTripleMin),
        s.resultado.jornadaSemanalMaxMin,
        s.resultado.alertas.map((a) => a.codigo).join(" "),
        s.acuerdo ?? "sin acuerdo firmado",
        s.conformidad ? `${s.conformidad.respuesta} ${s.conformidad.respondido_en}` : "sin respuesta",
      ]));
    }
  }
  return BOM + filas.join("\r\n") + "\r\n";
}
