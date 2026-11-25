import { describe, expect, it } from "vitest";
import { generarTextoAcuerdo, type DatosAcuerdo } from "./acuerdo";

const base = (ubicacion?: { celular: boolean; kiosco: boolean }, t: Partial<DatosAcuerdo["trabajador"]> = {}): DatosAcuerdo => ({
  version: 1,
  fecha: "2026-11-25",
  empresa: { razonSocial: "Tortillería Doña Lupita", rfc: null },
  centro: { nombre: "Matriz", direccion: null, pausaPuedeSalir: true, ubicacion },
  trabajador: {
    nombre: "María López",
    numeroEmpleado: "101",
    curp: null,
    email: "maria@ejemplo.mx",
    diaDescanso: 0,
    jornadaPactadaMin: null,
    ...t,
  },
});

describe("cláusula de ubicación (NOVENA)", () => {
  it("apagada, el texto es idéntico al de antes: no desactualiza acuerdos firmados", () => {
    const antes = generarTextoAcuerdo(base());
    expect(generarTextoAcuerdo(base({ celular: false, kiosco: false }))).toBe(antes);
    expect(antes).toContain("No se recaban datos biométricos ni de ubicación.");
  });

  it("encendida, dice para qué métodos, que no impide registrar y que se borra a los 90 días", () => {
    const texto = generarTextoAcuerdo(base({ celular: true, kiosco: true }));
    expect(texto).toContain("en los registros desde su teléfono celular y desde el kiosco se registra la ubicación aproximada");
    expect(texto).toContain("no impide hacer el registro");
    expect(texto).toContain("se elimina a los 90 días");
    expect(texto).not.toContain("ni de ubicación");
  });

  it("solo para los métodos que la persona usa", () => {
    expect(generarTextoAcuerdo(base({ celular: true, kiosco: false }, { email: null }))).toContain("ni de ubicación");
    expect(generarTextoAcuerdo(base({ celular: false, kiosco: true }, { email: null }))).toContain("en los registros desde el kiosco se registra");
  });
});
