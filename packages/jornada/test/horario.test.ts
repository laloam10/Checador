import { describe, expect, it } from "vitest";
import { duracionTramo, programadoDe, retardoDe, senalesHorario, type Horario } from "../src";

// Lunes a viernes 08:00–17:00 con comida; tolerancia 10 min. 2026-11-02 es lunes.
const oficina: Horario = {
  dias: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), { entrada: "08:00", salida: "17:00", pausa_inicio: "13:00", pausa_fin: "14:00" }])),
  toleranciaMin: 10,
};
// Nocturno lunes a viernes 22:00–06:00.
const nocturno: Horario = { dias: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), { entrada: "22:00", salida: "06:00" }])), toleranciaMin: 10 };
const turno = (inicio: string, fin: string) => ({ inicio, fin });

describe("horario", () => {
  it("duración y programado, también cruzando la medianoche", () => {
    expect(duracionTramo({ entrada: "08:00", salida: "17:00" })).toBe(540);
    expect(duracionTramo({ entrada: "22:00", salida: "06:00" })).toBe(480);
    expect(programadoDe(oficina, "2026-11-02")).toEqual({ inicio: "2026-11-02T08:00", fin: "2026-11-02T17:00" });
    expect(programadoDe(nocturno, "2026-11-02")).toEqual({ inicio: "2026-11-02T22:00", fin: "2026-11-03T06:00" });
    expect(programadoDe(oficina, "2026-11-07")).toBeNull();
  });

  it("dentro de la tolerancia no hay señal", () => {
    expect(senalesHorario([turno("2026-11-02T08:09", "2026-11-02T16:55")], oficina)).toEqual([]);
  });

  it("retardo, salida anticipada y fuera de horario", () => {
    expect(senalesHorario([turno("2026-11-02T08:25", "2026-11-02T16:30")], oficina).map((s) => [s.codigo, s.minutos])).toEqual([
      ["RETARDO", 25],
      ["SALIDA_ANTICIPADA", 30],
    ]);
    expect(senalesHorario([turno("2026-11-02T07:30", "2026-11-02T19:00")], oficina).map((s) => [s.codigo, s.minutos])).toEqual([
      ["FUERA_DE_HORARIO", 150],
    ]);
  });

  it("varios turnos del mismo día cuentan como uno (primera entrada, última salida)", () => {
    const s = senalesHorario([turno("2026-11-02T08:00", "2026-11-02T12:00"), turno("2026-11-02T14:00", "2026-11-02T17:05")], oficina);
    expect(s).toEqual([]);
  });

  it("día no programado", () => {
    const s = senalesHorario([turno("2026-11-07T09:00", "2026-11-07T13:00")], oficina);
    expect(s).toEqual([{ fecha: "2026-11-07", codigo: "DIA_NO_PROGRAMADO", minutos: 240, mensaje: "Trabajó en un día que su horario no incluye." }]);
  });

  it("turno nocturno: una entrada pasada la medianoche es retardo del día anterior, no otro día", () => {
    const s = senalesHorario([turno("2026-11-03T00:20", "2026-11-03T06:00")], nocturno);
    expect(s.map((x) => [x.fecha, x.codigo, x.minutos])).toEqual([["2026-11-02", "RETARDO", 140]]);
    expect(retardoDe(nocturno, "2026-11-02T22:05")).toBe(0);
    expect(retardoDe(nocturno, "2026-11-03T00:20")).toBe(140);
  });

  it("los mensajes no muestran nada más que minutos y la hora del horario", () => {
    const [s] = senalesHorario([turno("2026-11-02T08:25", "2026-11-02T17:00")], oficina);
    expect(s!.mensaje).toBe("Entró 25 min después de su horario (08:00).");
  });
});
