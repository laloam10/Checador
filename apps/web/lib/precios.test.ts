import { describe, expect, it } from "vitest";
import { pesos, precioMensual } from "./precios";

describe("precioMensual", () => {
  const casos: [number, number][] = [
    [0, 19900], [1, 19900], [2, 19900], [3, 24900], [5, 34900], [6, 39900],
    [10, 59900], [11, 62900], [15, 74900], [20, 89900], [30, 119900], [40, 149900],
  ];
  it.each(casos)("%i personas cuestan %i centavos al mes", (personas, centavos) => {
    expect(precioMensual(personas).mensualCentavos).toBe(centavos);
  });

  it("agregar a una persona nunca cuesta más de $50 (sin saltos)", () => {
    for (let n = 1; n <= 40; n++) {
      const diferencia = precioMensual(n).mensualCentavos - precioMensual(n - 1).mensualCentavos;
      expect(diferencia).toBeLessThanOrEqual(5000);
      expect(diferencia).toBeGreaterThanOrEqual(0);
    }
  });

  it("desglosa por tramo, calcula el IVA y el año cuesta 10 meses", () => {
    const p = precioMensual(12);
    expect(p.renglones).toEqual([
      { desde: 3, hasta: 10, personas: 8, porPersonaCentavos: 5000, subtotalCentavos: 40000 },
      { desde: 11, hasta: 40, personas: 2, porPersonaCentavos: 3000, subtotalCentavos: 6000 },
    ]);
    expect(p.mensualCentavos).toBe(65900);
    expect(p.ivaCentavos).toBe(10544);
    expect(p.mensualConIvaCentavos).toBe(76444);
    expect(p.anualCentavos).toBe(659000);
    expect(p.cotizar).toBe(false);
  });

  it("más de 40 personas se cotiza", () => {
    expect(precioMensual(41).cotizar).toBe(true);
    expect(precioMensual(40).cotizar).toBe(false);
  });

  it("formatea pesos", () => {
    expect(pesos(149900)).toBe("$1,499");
    expect(pesos(69484)).toBe("$694.84");
  });
});
