/**
 * Reconstrucción de turnos a partir de la bitácora de eventos.
 *
 * La bitácora es de solo inserción: las correcciones y anulaciones son eventos
 * nuevos que apuntan al evento original. Aquí se aplican para obtener la vista
 * vigente y se emparejan entradas, salidas y pausas.
 */

import type { FechaHoraLocal, Pausa, Turno } from "./tipos";

export type TipoEventoBitacora =
  | "entrada"
  | "salida"
  | "inicio_pausa"
  | "fin_pausa"
  | "correccion"
  | "anulacion";

export interface EventoBitacora {
  /** Identificador; también define el orden de aplicación de los ajustes. */
  id: number | string;
  tipo: TipoEventoBitacora;
  /** Momento que representa el evento, ISO 8601 con zona (p. ej. de timestamptz). */
  horaEfectiva: string;
  puedeSalir?: boolean | null;
  corrigeEventoId?: number | string | null;
  diferido?: boolean;
}

export type CodigoIncidencia =
  | "ENTRADA_SIN_SALIDA"
  | "SALIDA_SIN_ENTRADA"
  | "PAUSA_SIN_CIERRE"
  | "FIN_PAUSA_SIN_INICIO"
  | "PAUSA_FUERA_DE_TURNO";

export interface Incidencia {
  codigo: CodigoIncidencia;
  eventoId: number | string;
  mensaje: string;
}

export interface TurnoReconstruido extends Turno {
  eventoIds: (number | string)[];
  /** Algún evento del turno se capturó sin conexión. */
  tieneDiferidos: boolean;
}

export type EstadoTrabajador = "fuera" | "trabajando" | "en_pausa";

export interface Reconstruccion {
  turnos: TurnoReconstruido[];
  /** Turno abierto reciente (menos de 24 h): aún no se contabiliza. */
  enCurso: { inicio: FechaHoraLocal; enPausa: boolean } | null;
  estado: EstadoTrabajador;
  incidencias: Incidencia[];
}

const MAX_TURNO_MS = 24 * 60 * 60 * 1000;

/**
 * Convierte un instante a la hora local del centro de trabajo (`YYYY-MM-DDTHH:mm`).
 * Los segundos se truncan.
 */
export function aHoraLocal(iso: string | Date, zonaHoraria: string): FechaHoraLocal {
  const fecha = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(fecha.getTime())) throw new TypeError(`Instante inválido: ${String(iso)}`);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const p = (t: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === t)!.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}

interface Captura {
  id: number | string;
  tipo: "entrada" | "salida" | "inicio_pausa" | "fin_pausa";
  ms: number;
  puedeSalir: boolean;
  diferido: boolean;
}

/** Aplica correcciones y anulaciones y devuelve los eventos de captura vigentes. */
export function aplicarAjustes(eventos: readonly EventoBitacora[]): Captura[] {
  const ordenados = [...eventos].sort((a, b) => compararId(a.id, b.id));
  const capturas = new Map<string, Captura>();
  const raizDe = new Map<string, string>(); // ajuste → evento de captura raíz

  for (const e of ordenados) {
    const clave = String(e.id);
    if (e.tipo === "correccion" || e.tipo === "anulacion") {
      if (e.corrigeEventoId == null) continue;
      let raiz = String(e.corrigeEventoId);
      while (raizDe.has(raiz)) raiz = raizDe.get(raiz)!;
      raizDe.set(clave, raiz);
      const objetivo = capturas.get(raiz);
      if (!objetivo) continue;
      if (e.tipo === "anulacion") capturas.delete(raiz);
      else objetivo.ms = Date.parse(e.horaEfectiva);
      continue;
    }
    capturas.set(clave, {
      id: e.id,
      tipo: e.tipo,
      ms: Date.parse(e.horaEfectiva),
      puedeSalir: e.puedeSalir ?? false,
      diferido: e.diferido ?? false,
    });
  }
  return [...capturas.values()].sort((a, b) => a.ms - b.ms || compararId(a.id, b.id));
}

/**
 * Empareja los eventos vigentes en turnos.
 * @param ahora Instante de referencia para distinguir un turno en curso de una salida olvidada.
 */
export function reconstruirTurnos(
  eventos: readonly EventoBitacora[],
  zonaHoraria: string,
  ahora: Date = new Date(),
): Reconstruccion {
  const local = (ms: number) => aHoraLocal(new Date(ms), zonaHoraria);
  const turnos: TurnoReconstruido[] = [];
  const incidencias: Incidencia[] = [];

  let abierto: { entrada: Captura; pausas: Pausa[]; ids: Captura["id"][]; diferidos: boolean } | null = null;
  let pausa: Captura | null = null;

  const cerrarPausa = (finMs: number) => {
    if (!abierto || !pausa) return;
    if (finMs > pausa.ms) {
      abierto.pausas.push({ inicio: local(pausa.ms), fin: local(finMs), puedeSalir: pausa.puedeSalir });
    }
    pausa = null;
  };

  const descartarAbierto = () => {
    if (!abierto) return;
    incidencias.push({
      codigo: "ENTRADA_SIN_SALIDA",
      eventoId: abierto.entrada.id,
      mensaje: `Entrada del ${local(abierto.entrada.ms).replace("T", " ")} sin salida registrada.`,
    });
    abierto = null;
    pausa = null;
  };

  for (const c of aplicarAjustes(eventos)) {
    // Un turno abierto por más de 24 h es una salida olvidada.
    if (abierto && c.ms - abierto.entrada.ms > MAX_TURNO_MS) descartarAbierto();

    switch (c.tipo) {
      case "entrada":
        if (abierto) descartarAbierto();
        abierto = { entrada: c, pausas: [], ids: [c.id], diferidos: c.diferido };
        break;
      case "inicio_pausa":
        if (!abierto) {
          incidencias.push({ codigo: "PAUSA_FUERA_DE_TURNO", eventoId: c.id, mensaje: "Inicio de pausa sin turno abierto." });
        } else {
          if (pausa) {
            incidencias.push({ codigo: "PAUSA_SIN_CIERRE", eventoId: (pausa as Captura).id, mensaje: "Pausa sin cierre; se cerró al iniciar otra." });
            cerrarPausa(c.ms);
          }
          pausa = c;
          abierto.ids.push(c.id);
          abierto.diferidos ||= c.diferido;
        }
        break;
      case "fin_pausa":
        if (!abierto || !pausa) {
          incidencias.push({ codigo: "FIN_PAUSA_SIN_INICIO", eventoId: c.id, mensaje: "Fin de pausa sin inicio registrado." });
        } else {
          cerrarPausa(c.ms);
          abierto.ids.push(c.id);
          abierto.diferidos ||= c.diferido;
        }
        break;
      case "salida":
        if (!abierto) {
          incidencias.push({ codigo: "SALIDA_SIN_ENTRADA", eventoId: c.id, mensaje: `Salida del ${local(c.ms).replace("T", " ")} sin entrada registrada.` });
          break;
        }
        if (pausa) {
          incidencias.push({ codigo: "PAUSA_SIN_CIERRE", eventoId: (pausa as Captura).id, mensaje: "Pausa sin cierre; se cerró a la hora de salida." });
          cerrarPausa(c.ms);
        }
        if (c.ms > abierto.entrada.ms) {
          turnos.push({
            inicio: local(abierto.entrada.ms),
            fin: local(c.ms),
            pausas: abierto.pausas,
            eventoIds: [...abierto.ids, c.id],
            tieneDiferidos: abierto.diferidos || c.diferido,
          });
        }
        abierto = null;
        break;
    }
  }

  let enCurso: Reconstruccion["enCurso"] = null;
  if (abierto) {
    const a = abierto as { entrada: Captura };
    if (ahora.getTime() - a.entrada.ms > MAX_TURNO_MS) descartarAbierto();
    else enCurso = { inicio: local(a.entrada.ms), enPausa: pausa !== null };
  }

  return {
    turnos,
    enCurso,
    estado: enCurso ? (enCurso.enPausa ? "en_pausa" : "trabajando") : "fuera",
    incidencias,
  };
}

function compararId(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true });
}
