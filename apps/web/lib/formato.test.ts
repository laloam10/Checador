import { describe, expect, it } from "vitest";
import { fecha, fechaConDia, fechaHora, fechaHoraNumerica, fechaLarga, fechaNumerica, iniciales, rangoFechas, telefonoLegible } from "./formato";

describe("formato de fechas", () => {
  it("fecha y día", () => {
    expect(fecha("2015-09-14")).toBe("14 sep 2015");
    expect(fechaConDia("2026-11-24")).toBe("mar 24 nov 2026");
  });
  it("fecha y hora en la zona del centro; el año solo si no es el actual o si se pide", () => {
    expect(fechaHora("2020-03-02T18:05:00Z", "America/Mexico_City")).toBe("lun 2 mar 2020, 12:05");
    const anio = new Date().getUTCFullYear();
    expect(fechaHora(`${anio}-06-15T17:00:00Z`, "America/Mexico_City")).toMatch(/^\w{3} 15 jun, 11:00$/);
    expect(fechaHora(`${anio}-06-15T17:00:00Z`, "America/Mexico_City", true)).toContain(` 15 jun ${anio}, 11:00`);
  });
  it("rangos de semana", () => {
    expect(rangoFechas("2026-10-26", "2026-11-01")).toBe("26 oct – 1 nov 2026");
    expect(rangoFechas("2026-11-02", "2026-11-08")).toBe("2 – 8 nov 2026");
    expect(rangoFechas("2025-12-29", "2026-01-04")).toBe("29 dic 2025 – 4 ene 2026");
  });
  it("fechas de documentos", () => {
    expect(fechaLarga("2026-10-26")).toBe("26 de octubre de 2026");
    expect(fechaNumerica("2026-10-06")).toBe("06/10/2026");
    expect(fechaHoraNumerica("2026-10-26T14:05:00Z", "America/Mexico_City")).toBe("26/10/2026 08:05");
  });
  it("teléfono e iniciales", () => {
    expect(telefonoLegible("523318922547")).toBe("33 1892 2547");
    expect(telefonoLegible("+1 555")).toBe("+1 555");
    expect(iniciales("José Hernández López")).toBe("JH");
    expect(iniciales("Ana")).toBe("A");
  });
});
