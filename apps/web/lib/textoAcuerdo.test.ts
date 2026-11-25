import { describe, expect, it } from "vitest";
import { generarTextoAcuerdo } from "./acuerdo";
import { bloquesAcuerdo } from "./textoAcuerdo";

const texto = generarTextoAcuerdo({
  version: 1, fecha: "2026-11-25",
  empresa: { razonSocial: "Tortillería Doña Lupita", rfc: null },
  centro: { nombre: "Matriz", direccion: null, pausaPuedeSalir: true },
  trabajador: { nombre: "María López", numeroEmpleado: "101", curp: null, email: "m@x.mx", diaDescanso: 0, jornadaPactadaMin: null },
});

describe("estructura del texto del acuerdo", () => {
  it("título, datos de la versión, apartado y las once cláusulas por su nombre", () => {
    const b = bloquesAcuerdo(texto);
    expect(b[0]).toEqual({ tipo: "titulo", texto: "ACUERDO PARA EL REGISTRO ELECTRÓNICO DE LA JORNADA DE TRABAJO" });
    expect(b[1]?.tipo).toBe("meta");
    expect(b.some((x) => x.tipo === "apartado")).toBe(true);
    expect(b.filter((x) => x.tipo === "clausula").map((x) => (x as { nombre: string }).nombre.split(".")[0])).toEqual([
      "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA", "DÉCIMA PRIMERA",
    ]);
    expect(b.some((x) => x.tipo === "inciso")).toBe(true);
  });

  it("no pierde ni cambia texto", () => {
    const junto = bloquesAcuerdo(texto).map((x) => (x.tipo === "clausula" ? `${x.nombre} ${x.texto}` : x.texto)).join("\n");
    expect(junto).toBe(texto.split("\n").filter((l) => l.trim()).join("\n"));
  });

  it("una línea larga en mayúsculas se procesa al instante", () => {
    const inicio = Date.now();
    bloquesAcuerdo(`X\nY\n${"PALABRA ".repeat(400)}FIN`);
    expect(Date.now() - inicio).toBeLessThan(50);
  });
});
