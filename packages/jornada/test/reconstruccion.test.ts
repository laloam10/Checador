import { describe, expect, it } from "vitest";
import { aHoraLocal, calcularSemana, reconstruirTurnos, type EventoBitacora } from "../src/index.js";

const ZONA = "America/Mexico_City"; // UTC-6 todo el año (sin horario de verano desde 2022)
// Hora local de CDMX → instante UTC.
const cdmx = (local: string) => new Date(`${local}:00-06:00`).toISOString();
const AHORA = new Date(cdmx("2027-01-11T12:00"));

let n = 0;
const ev = (tipo: EventoBitacora["tipo"], local: string, extra: Partial<EventoBitacora> = {}): EventoBitacora => ({
  id: ++n,
  tipo,
  horaEfectiva: cdmx(local),
  ...(tipo === "inicio_pausa" ? { puedeSalir: true } : {}),
  ...extra,
});

describe("aHoraLocal", () => {
  it("convierte UTC a la hora local del centro de trabajo", () => {
    expect(aHoraLocal("2027-01-04T14:00:00Z", ZONA)).toBe("2027-01-04T08:00");
    expect(aHoraLocal("2027-01-05T02:30:00Z", ZONA)).toBe("2027-01-04T20:30");
    expect(aHoraLocal("2027-01-04T14:00:00Z", "America/Tijuana")).toBe("2027-01-04T06:00");
  });
});

describe("reconstruirTurnos", () => {
  it("empareja entrada, pausa y salida", () => {
    const r = reconstruirTurnos(
      [
        ev("entrada", "2027-01-04T08:00"),
        ev("inicio_pausa", "2027-01-04T13:00"),
        ev("fin_pausa", "2027-01-04T14:00"),
        ev("salida", "2027-01-04T17:00"),
      ],
      ZONA,
      AHORA,
    );
    expect(r.incidencias).toEqual([]);
    expect(r.estado).toBe("fuera");
    expect(r.turnos).toHaveLength(1);
    expect(r.turnos[0]).toMatchObject({
      inicio: "2027-01-04T08:00",
      fin: "2027-01-04T17:00",
      pausas: [{ inicio: "2027-01-04T13:00", fin: "2027-01-04T14:00", puedeSalir: true }],
    });
  });

  it("aplica correcciones (la más reciente prevalece) y anulaciones", () => {
    const entrada = ev("entrada", "2027-01-04T08:20");
    const salidaDuplicada = ev("salida", "2027-01-04T16:00");
    const r = reconstruirTurnos(
      [
        entrada,
        ev("correccion", "2027-01-04T08:10", { corrigeEventoId: entrada.id }),
        ev("correccion", "2027-01-04T08:00", { corrigeEventoId: entrada.id }),
        salidaDuplicada,
        ev("anulacion", "2027-01-04T18:00", { corrigeEventoId: salidaDuplicada.id }),
        ev("salida", "2027-01-04T17:00"),
      ],
      ZONA,
      AHORA,
    );
    expect(r.turnos.map((t) => [t.inicio, t.fin])).toEqual([["2027-01-04T08:00", "2027-01-04T17:00"]]);
  });

  it("una corrección de una corrección se aplica al evento original", () => {
    const entrada = ev("entrada", "2027-01-04T09:00");
    const c1 = ev("correccion", "2027-01-04T08:30", { corrigeEventoId: entrada.id });
    const r = reconstruirTurnos(
      [entrada, c1, ev("correccion", "2027-01-04T08:00", { corrigeEventoId: c1.id }), ev("salida", "2027-01-04T16:00")],
      ZONA,
      AHORA,
    );
    expect(r.turnos[0]?.inicio).toBe("2027-01-04T08:00");
  });

  it("detecta salida olvidada y salida sin entrada", () => {
    const r = reconstruirTurnos(
      [ev("entrada", "2027-01-04T08:00"), ev("entrada", "2027-01-05T08:00"), ev("salida", "2027-01-05T16:00"), ev("salida", "2027-01-05T17:00")],
      ZONA,
      AHORA,
    );
    expect(r.turnos).toHaveLength(1);
    expect(r.incidencias.map((i) => i.codigo)).toEqual(["ENTRADA_SIN_SALIDA", "SALIDA_SIN_ENTRADA"]);
  });

  it("turno abierto hace menos de 24 h está en curso y no se contabiliza", () => {
    const r = reconstruirTurnos(
      [ev("entrada", "2027-01-11T08:00"), ev("inicio_pausa", "2027-01-11T11:30")],
      ZONA,
      AHORA,
    );
    expect(r.turnos).toEqual([]);
    expect(r.estado).toBe("en_pausa");
    expect(r.enCurso).toEqual({ inicio: "2027-01-11T08:00", enPausa: true });
  });

  it("turno abierto hace más de 24 h es una salida olvidada", () => {
    const r = reconstruirTurnos([ev("entrada", "2027-01-09T08:00")], ZONA, AHORA);
    expect(r.estado).toBe("fuera");
    expect(r.incidencias.map((i) => i.codigo)).toEqual(["ENTRADA_SIN_SALIDA"]);
  });

  it("pausa sin cierre se cierra a la salida, con incidencia", () => {
    const r = reconstruirTurnos(
      [ev("entrada", "2027-01-04T08:00"), ev("inicio_pausa", "2027-01-04T16:00"), ev("salida", "2027-01-04T17:00")],
      ZONA,
      AHORA,
    );
    expect(r.turnos[0]?.pausas).toEqual([{ inicio: "2027-01-04T16:00", fin: "2027-01-04T17:00", puedeSalir: true }]);
    expect(r.incidencias.map((i) => i.codigo)).toEqual(["PAUSA_SIN_CIERRE"]);
  });

  it("marca turnos con capturas diferidas", () => {
    const r = reconstruirTurnos(
      [ev("entrada", "2027-01-04T08:00", { diferido: true }), ev("salida", "2027-01-04T16:00")],
      ZONA,
      AHORA,
    );
    expect(r.turnos[0]?.tieneDiferidos).toBe(true);
  });

  it("se integra con calcularSemana (turno nocturno que cruza la medianoche)", () => {
    const r = reconstruirTurnos([ev("entrada", "2027-01-04T22:00"), ev("salida", "2027-01-05T06:00")], ZONA, AHORA);
    const s = calcularSemana("2027-01-04", r.turnos, { diaDescanso: 0 });
    expect(s.dias[0]).toMatchObject({ tipo: "nocturna", ordinariaMin: 7 * 60, extraDobleMin: 60 });
  });
});

import { localAInstante } from "../src/index.js";

describe("localAInstante", () => {
  it("es la inversa de aHoraLocal", () => {
    expect(localAInstante("2027-01-04T08:00", "America/Mexico_City").toISOString()).toBe("2027-01-04T14:00:00.000Z");
    expect(localAInstante("2027-01-04T22:30", "America/Tijuana").toISOString()).toBe("2027-01-05T06:30:00.000Z");
    for (const local of ["2027-03-14T01:30", "2027-07-01T12:00", "2027-11-07T03:00"]) {
      expect(aHoraLocal(localAInstante(local, "America/Tijuana"), "America/Tijuana")).toBe(local);
    }
  });
  it("rechaza formatos inválidos", () => {
    expect(() => localAInstante("2027-01-04 08:00", "America/Mexico_City")).toThrow(TypeError);
  });
});
