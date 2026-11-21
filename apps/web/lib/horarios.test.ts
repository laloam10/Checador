import { describe, expect, it } from "vitest";
import { horarioDesdeFormulario, horarioEfectivo, minutosNetos, resumenHorario, type HorarioFila } from "./horarios";

const form = (campos: Record<string, string>) => (k: string) => campos[k] ?? "";
const semana = (extra: Record<string, string> = {}) => {
  const c: Record<string, string> = { nombre: "Matutino", tolerancia: "10" };
  for (const d of [1, 2, 3, 4, 5]) Object.assign(c, { [`dia_${d}`]: "on", [`entrada_${d}`]: "08:00", [`salida_${d}`]: "17:00", [`pausa_inicio_${d}`]: "13:00", [`pausa_fin_${d}`]: "14:00" });
  return { ...c, ...extra };
};

describe("horarios", () => {
  it("lee el formulario", () => {
    const r = horarioDesdeFormulario(form(semana({ dia_6: "on", entrada_6: "08:00", salida_6: "13:00" })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.dias).sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(r.dias["6"]).toEqual({ entrada: "08:00", salida: "13:00" });
    expect(resumenHorario(r.dias)).toBe("Lun–Vie 08:00–17:00 (comida 13:00–14:00) · Sáb 08:00–13:00");
  });
  it("rechaza lo que no tiene sentido", () => {
    const err = (c: Record<string, string>) => (horarioDesdeFormulario(form(c)) as { error: string }).error;
    expect(err(semana({ nombre: "" }))).toMatch(/nombre/);
    expect(err({ nombre: "x" })).toMatch(/al menos un día/);
    expect(err(semana({ salida_1: "" }))).toMatch(/^Lunes: escribe la hora/);
    expect(err(semana({ pausa_fin_2: "" }))).toMatch(/^Martes: escribe el inicio y el fin de la comida/);
    expect(err(semana({ pausa_inicio_3: "18:00", pausa_fin_3: "19:00" }))).toMatch(/dentro del turno/);
    expect(err(semana({ entrada_4: "05:00", salida_4: "22:00", pausa_inicio_4: "", pausa_fin_4: "" }))).toMatch(/16 horas/);
    expect(err(semana({ entrada_5: "06:00", salida_5: "20:00", pausa_inicio_5: "", pausa_fin_5: "" }))).toMatch(/12 horas/);
    expect(err(semana({ tolerancia: "90" }))).toMatch(/tolerancia/);
  });
  it("turno nocturno y minutos netos", () => {
    const r = horarioDesdeFormulario(form({ nombre: "Noche", dia_1: "on", entrada_1: "22:00", salida_1: "06:00", pausa_inicio_1: "02:00", pausa_fin_1: "02:30" }));
    expect(r.ok && minutosNetos(r.dias["1"]!)).toBe(450);
  });
  it("horario efectivo: el propio, el de la empresa o ninguno", () => {
    const hs = [{ id: "a" }, { id: "b" }] as HorarioFila[];
    expect(horarioEfectivo({ horario_id: "b", sin_horario_fijo: false }, hs, "a")?.id).toBe("b");
    expect(horarioEfectivo({ horario_id: null, sin_horario_fijo: false }, hs, "a")?.id).toBe("a");
    expect(horarioEfectivo({ horario_id: null, sin_horario_fijo: true }, hs, "a")).toBeNull();
    expect(horarioEfectivo({ horario_id: null, sin_horario_fijo: false }, hs, null)).toBeNull();
  });
});
