import { describe, expect, it } from "vitest";
import { reconstruirTurnos, type EventoBitacora } from "@checador/jornada";
import { incidenciasDeLaSemana } from "./incidencias";

const ZONA = "America/Mexico_City"; // UTC−6
const ev = (id: number, tipo: EventoBitacora["tipo"], local: string): EventoBitacora & { hora_efectiva: string } => {
  const iso = new Date(`${local}:00-06:00`).toISOString();
  return { id, tipo, horaEfectiva: iso, hora_efectiva: iso, puedeSalir: null, corrigeEventoId: null, diferido: false };
};

describe("incidenciasDeLaSemana", () => {
  it("no reporta en la semana siguiente un turno del viernes en la tarde partido por el margen de carga", () => {
    // La semana del lunes 16 se carga desde el sábado 14 00:00 UTC = viernes 13 18:00 en México:
    // la entrada de las 16:00 queda fuera y la salida de las 21:00 dentro.
    const cargadas = [ev(2, "salida", "2026-11-13T21:00"), ev(3, "entrada", "2026-11-16T16:00"), ev(4, "salida", "2026-11-16T21:00")];
    const r = reconstruirTurnos(cargadas, ZONA);
    expect(r.incidencias.map((i) => i.eventoId)).toEqual([2]);
    expect(incidenciasDeLaSemana(r.incidencias, cargadas.map((e) => ({ id: e.id, hora_efectiva: e.hora_efectiva })), ZONA, "2026-11-16")).toEqual([]);
  });

  it("conserva las incidencias de checadas dentro de la semana", () => {
    const cargadas = [ev(5, "entrada", "2026-11-17T16:00"), ev(6, "salida", "2026-11-22T23:30")];
    const filas = cargadas.map((e) => ({ id: e.id, hora_efectiva: e.hora_efectiva }));
    const incidencias = [
      { codigo: "SALIDA_SIN_ENTRADA" as const, eventoId: 6, mensaje: "x" },
      { codigo: "SALIDA_SIN_ENTRADA" as const, eventoId: 99, mensaje: "sin hora conocida" },
    ];
    expect(incidenciasDeLaSemana(incidencias as never, filas, ZONA, "2026-11-16").map((i) => i.eventoId)).toEqual([6, 99]);
  });
});
