import { describe, expect, it } from "vitest";
import {
  calcularSemana,
  clasificarJornada,
  jornadaSemanalMaxMin,
  minutosEfectivos,
  pagoTiempoExtraCentavos,
  topeExtraSemanalMin,
  type ConfigTrabajador,
  type Turno,
} from "../src/index.js";
import { aMinutos, sumarDias } from "../src/tiempo.js";

const H = 60;
const DOMINGO: ConfigTrabajador = { diaDescanso: 0 };

/** Turnos diurnos desde las 07:00, de `horas` cada uno, en días consecutivos a partir de `lunes`. */
function turnosDiurnos(lunes: string, horasPorDia: number[]): Turno[] {
  return horasPorDia.map((h, i) => {
    const fecha = sumarDias(lunes, i);
    const fin = 7 * H + h * H;
    const hh = String(Math.floor(fin / H)).padStart(2, "0");
    const mm = String(fin % H).padStart(2, "0");
    return { inicio: `${fecha}T07:00`, fin: `${fecha}T${hh}:${mm}` };
  });
}

describe("límites legales (transitorios 2.º y 4.º)", () => {
  it("jornada semanal máxima por año", () => {
    expect([2026, 2027, 2028, 2029, 2030, 2035].map((a) => jornadaSemanalMaxMin(a) / H)).toEqual([
      48, 46, 44, 42, 40, 40,
    ]);
  });
  it("tope semanal de extra al doble por año", () => {
    expect([2026, 2027, 2028, 2029, 2030, 2035].map((a) => topeExtraSemanalMin(a) / H)).toEqual([
      9, 9, 10, 11, 12, 12,
    ]);
  });
  it("rechaza años anteriores a la reforma", () => {
    expect(() => jornadaSemanalMaxMin(2025)).toThrow(RangeError);
  });
});

describe("clasificación de jornada (art. 60)", () => {
  const tipo = (a: string, b: string) => clasificarJornada(aMinutos(a), aMinutos(b));
  it("diurna: todo entre 06:00 y 20:00", () => {
    expect(tipo("2027-01-04T08:00", "2027-01-04T16:00")).toBe("diurna");
  });
  it("nocturna: todo entre 20:00 y 06:00", () => {
    expect(tipo("2027-01-04T22:00", "2027-01-05T05:00")).toBe("nocturna");
  });
  it("mixta: periodo nocturno menor a 3.5 h", () => {
    expect(tipo("2027-01-04T15:00", "2027-01-04T22:30")).toBe("mixta");
  });
  it("se reputa nocturna con 3.5 h o más de periodo nocturno", () => {
    expect(tipo("2027-01-04T16:00", "2027-01-04T23:30")).toBe("nocturna");
  });
});

describe("tiempo efectivo (art. 64)", () => {
  it("descuenta pausas en que puede salir; computa las que no", () => {
    const base = { inicio: "2027-01-04T08:00", fin: "2027-01-04T17:00" };
    expect(
      minutosEfectivos({ ...base, pausas: [{ inicio: "2027-01-04T13:00", fin: "2027-01-04T14:00", puedeSalir: true }] }),
    ).toBe(8 * H);
    expect(
      minutosEfectivos({ ...base, pausas: [{ inicio: "2027-01-04T13:00", fin: "2027-01-04T14:00", puedeSalir: false }] }),
    ).toBe(9 * H);
  });
  it("rechaza turnos invertidos y pausas fuera del turno", () => {
    expect(() => minutosEfectivos({ inicio: "2027-01-04T10:00", fin: "2027-01-04T09:00" })).toThrow(RangeError);
    expect(() =>
      minutosEfectivos({
        inicio: "2027-01-04T08:00",
        fin: "2027-01-04T12:00",
        pausas: [{ inicio: "2027-01-04T11:00", fin: "2027-01-04T13:00", puedeSalir: true }],
      }),
    ).toThrow(RangeError);
  });
});

describe("calcularSemana", () => {
  it("2026: 6 días de 8 h = 48 h, sin tiempo extra", () => {
    const r = calcularSemana("2026-11-02", turnosDiurnos("2026-11-02", [8, 8, 8, 8, 8, 8]), DOMINGO);
    expect(r.totales).toEqual({ trabajadoMin: 48 * H, ordinariaMin: 48 * H, extraDobleMin: 0, extraTripleMin: 0 });
    expect(r.alertas).toEqual([]);
  });

  it("2027: la misma semana de 48 h genera 2 h extra por la reducción a 46 h", () => {
    const r = calcularSemana("2027-01-04", turnosDiurnos("2027-01-04", [8, 8, 8, 8, 8, 8]), DOMINGO);
    expect(r.jornadaSemanalMaxMin).toBe(46 * H);
    expect(r.totales.ordinariaMin).toBe(46 * H);
    expect(r.totales.extraDobleMin).toBe(2 * H);
    // El excedente se reclasifica en el último día.
    expect(r.dias.at(-1)).toMatchObject({ ordinariaMin: 6 * H, extraDobleMin: 2 * H });
  });

  it("art. 66: máximo 4 h al doble por día; el resto, al triple", () => {
    const r = calcularSemana("2026-11-02", turnosDiurnos("2026-11-02", [13]), DOMINGO);
    expect(r.dias[0]).toMatchObject({ ordinariaMin: 8 * H, extraDobleMin: 4 * H, extraTripleMin: 1 * H });
    expect(r.alertas.map((a) => a.codigo)).toContain("DIA_EXCEDE_12H");
  });

  it("art. 66: máximo 4 días con extra al doble; el 5.º día va al triple", () => {
    const r = calcularSemana("2030-01-07", turnosDiurnos("2030-01-07", [10, 10, 10, 10, 10]), DOMINGO);
    expect(r.dias.map((d) => d.extraDobleMin / H)).toEqual([2, 2, 2, 2, 0]);
    expect(r.dias.map((d) => d.extraTripleMin / H)).toEqual([0, 0, 0, 0, 2]);
  });

  it("transitorio 4.º: en 2026 el tope semanal al doble es 9 h", () => {
    const r = calcularSemana("2026-11-02", turnosDiurnos("2026-11-02", [12, 12, 12]), DOMINGO);
    expect(r.dias.map((d) => d.extraDobleMin / H)).toEqual([4, 4, 1]);
    expect(r.totales.extraTripleMin).toBe(3 * H);
    expect(r.alertas).toEqual([]);
  });

  it("art. 68: alerta cuando el triple excede 4 h semanales", () => {
    const r = calcularSemana("2030-01-07", turnosDiurnos("2030-01-07", [12, 12, 12, 12, 12, 12]), DOMINGO);
    expect(r.totales).toEqual({
      trabajadoMin: 72 * H,
      ordinariaMin: 40 * H,
      extraDobleMin: 12 * H,
      extraTripleMin: 20 * H,
    });
    const alerta = r.alertas.find((a) => a.codigo === "EXTRA_EXCEDE_LIMITE_LEGAL");
    expect(alerta?.minutos).toBe(16 * H);
  });

  it("art. 58: respeta la distribución pactada (9.6 h de lunes a viernes)", () => {
    const pacto: ConfigTrabajador = {
      diaDescanso: 0,
      jornadaPactadaMin: { 1: 576, 2: 576, 3: 576, 4: 576, 5: 576 },
    };
    const turnos: Turno[] = [0, 1, 2, 3, 4].map((i) => {
      const f = sumarDias("2026-11-02", i);
      return { inicio: `${f}T07:00`, fin: `${f}T16:36` };
    });
    const r2026 = calcularSemana("2026-11-02", turnos, pacto);
    expect(r2026.totales.extraDobleMin + r2026.totales.extraTripleMin).toBe(0);
    expect(r2026.alertas).toEqual([]);
  });

  it("alerta si el pacto excede la jornada máxima del año", () => {
    const pacto: ConfigTrabajador = {
      diaDescanso: 0,
      jornadaPactadaMin: { 1: 576, 2: 576, 3: 576, 4: 576, 5: 576 },
    };
    const turnos: Turno[] = [0, 1, 2, 3, 4].map((i) => {
      const f = sumarDias("2027-01-04", i);
      return { inicio: `${f}T07:00`, fin: `${f}T16:36` };
    });
    const r = calcularSemana("2027-01-04", turnos, pacto);
    expect(r.totales.extraDobleMin).toBe(2 * H);
    expect(r.alertas.find((a) => a.codigo === "PACTO_EXCEDE_MAXIMO_SEMANAL")?.minutos).toBe(2 * H);
  });

  it("semana que cruza de año aplica el límite más favorable al trabajador (art. 18)", () => {
    const r = calcularSemana("2026-12-28", [], DOMINGO);
    expect(r.jornadaSemanalMaxMin).toBe(46 * H);
    expect(r.topeExtraDobleMin).toBe(9 * H);
  });

  it("turno que cruza la medianoche se atribuye al día de inicio", () => {
    const r = calcularSemana("2027-01-04", [{ inicio: "2027-01-04T22:00", fin: "2027-01-05T05:00" }], DOMINGO);
    expect(r.dias).toHaveLength(1);
    expect(r.dias[0]).toMatchObject({ fecha: "2027-01-04", tipo: "nocturna", ordinariaMin: 7 * H });
  });

  it("alertas de domingo, día de descanso y semana sin descanso", () => {
    const r = calcularSemana("2027-01-04", turnosDiurnos("2027-01-04", [6, 6, 6, 6, 6, 6, 6]), {
      diaDescanso: 6,
    });
    const codigos = r.alertas.map((a) => a.codigo);
    expect(codigos).toContain("TRABAJO_EN_DOMINGO");
    expect(codigos).toContain("TRABAJO_EN_DIA_DESCANSO");
    expect(codigos).toContain("SIN_DESCANSO_SEMANAL");
  });

  it("descanso adicional pactado: alerta propia, sin la del art. 73", () => {
    // Semana del lunes 4 de enero de 2027; descanso obligatorio domingo y adicional sábado.
    const r = calcularSemana("2027-01-04", turnosDiurnos("2027-01-04", [8, 8, 8, 8, 8, 6]), {
      diaDescanso: 0,
      diasDescansoAdicionales: [6],
    });
    const sabado = r.alertas.filter((a) => a.fecha === "2027-01-09").map((a) => a.codigo);
    expect(sabado).toEqual(["TRABAJO_EN_DESCANSO_ADICIONAL"]);
    expect(r.alertas.map((a) => a.codigo)).not.toContain("TRABAJO_EN_DIA_DESCANSO");
    // Las horas del sábado cuentan para la semana como cualquier otra.
    expect(r.totales.trabajadoMin).toBe(46 * H);
  });

  it("si el día es el descanso obligatorio, solo aplica la alerta del art. 73", () => {
    const r = calcularSemana("2027-01-04", [{ inicio: "2027-01-09T07:00", fin: "2027-01-09T13:00" }], {
      diaDescanso: 6,
      diasDescansoAdicionales: [6, 0],
    });
    expect(r.alertas.map((a) => a.codigo)).toEqual(["TRABAJO_EN_DIA_DESCANSO"]);
  });

  it("rechaza turnos fuera de la semana", () => {
    expect(() =>
      calcularSemana("2027-01-04", [{ inicio: "2027-01-11T08:00", fin: "2027-01-11T16:00" }], DOMINGO),
    ).toThrow(RangeError);
  });
});

describe("pago de tiempo extra", () => {
  it("doble = 2× salario por hora; triple = 3×", () => {
    const r = calcularSemana("2026-11-02", turnosDiurnos("2026-11-02", [13]), DOMINGO);
    // 4 h dobles y 1 h triple a $50.00/h
    expect(pagoTiempoExtraCentavos(r, 5000)).toEqual({
      dobleCentavos: 40000,
      tripleCentavos: 15000,
      totalCentavos: 55000,
    });
  });
});
