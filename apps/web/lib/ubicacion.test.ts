import { describe, expect, it } from "vitest";
import { distanciaLegible, parametrosUbicacion, ubicacionDeCuerpo } from "./ubicacion";

describe("ubicacionDeCuerpo", () => {
  it("acepta coordenadas válidas y redondea la precisión", () => {
    expect(ubicacionDeCuerpo({ estado: "ok", latitud: 19.43, longitud: -99.13, precisionM: 18.6, capturadaEn: "2026-11-25T10:00:00Z" })).toEqual({
      estado: "ok", latitud: 19.43, longitud: -99.13, precisionM: 19, capturadaEn: "2026-11-25T10:00:00Z",
    });
  });
  it("sin permiso o sin señal solo guarda el estado", () => {
    expect(ubicacionDeCuerpo({ estado: "denegada", latitud: 1, longitud: 1 })?.latitud).toBeUndefined();
    expect(ubicacionDeCuerpo({ estado: "no_disponible" })?.estado).toBe("no_disponible");
  });
  it("descarta lo extraño (la checada se registra igual)", () => {
    expect(ubicacionDeCuerpo(null)).toBeNull();
    expect(ubicacionDeCuerpo({ estado: "ok" })).toBeNull();
    expect(ubicacionDeCuerpo({ estado: "ok", latitud: 95, longitud: 0 })).toBeNull();
    expect(ubicacionDeCuerpo({ estado: "ok", latitud: "19", longitud: -99 })).toBeNull();
    expect(ubicacionDeCuerpo({ estado: "rastreo" })).toBeNull();
  });
});

describe("presentación", () => {
  it("distancia en metros o kilómetros", () => {
    expect(distanciaLegible(40)).toBe("a 40 m");
    expect(distanciaLegible(3240)).toBe("a 3.2 km");
  });
  it("arma los parámetros de la base", () => {
    expect(parametrosUbicacion(7, { estado: "denegada", capturadaEn: "x" })).toEqual({
      p_evento: 7, p_estado: "denegada", p_latitud: null, p_longitud: null, p_precision_m: null, p_capturada_en: "x",
    });
  });
});
