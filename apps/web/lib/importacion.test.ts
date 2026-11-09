import { describe, expect, it } from "vitest";
import { decodificar, leerCsv, leerFecha, plantillaCsv, validarImportacion } from "./importacion";

const CENTROS = [
  { id: "c1", nombre: "Matriz" },
  { id: "c2", nombre: "Sucursal Norte" },
];
const SIN_EXISTENTES = { numeros: [], correos: [] };
const HOY = "2026-11-09";

describe("leerCsv", () => {
  it("lee comillas, comas dentro de campos y saltos de línea de Windows", () => {
    expect(leerCsv('a,b\r\n"López, Ana","dijo ""hola"""\r\n')).toEqual([
      ["a", "b"],
      ["López, Ana", 'dijo "hola"'],
    ]);
  });
  it("detecta punto y coma como separador", () => {
    expect(leerCsv("nombre;numero\nAna;1")).toEqual([
      ["nombre", "numero"],
      ["Ana", "1"],
    ]);
  });
});

describe("decodificar", () => {
  it("acepta UTF-8 con BOM y Windows-1252 (Excel)", () => {
    expect(decodificar(new Uint8Array([0xef, 0xbb, 0xbf, 0x4a, 0x6f, 0x73, 0xc3, 0xa9]))).toBe("José");
    expect(decodificar(new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]))).toBe("José");
  });
});

describe("leerFecha", () => {
  it("acepta día/mes/año y año-mes-día, y rechaza fechas imposibles", () => {
    expect(leerFecha("15/03/2026")).toBe("2026-03-15");
    expect(leerFecha("5-3-2026")).toBe("2026-03-05");
    expect(leerFecha("2026-03-15")).toBe("2026-03-15");
    expect(leerFecha("31/02/2026")).toBeNull();
    expect(leerFecha("03/15/2026")).toBeNull();
  });
});

describe("validarImportacion", () => {
  it("lee la plantilla", () => {
    const r = validarImportacion(plantillaCsv("Matriz"), CENTROS, SIN_EXISTENTES, HOY);
    expect(r.errores).toEqual([]);
    expect(r.trabajadores).toEqual([
      { nombre: "María López Hernández", numero_empleado: "101", email: "maria@ejemplo.mx", curp: null,
        centro_trabajo_id: "c1", fecha_ingreso: "2026-03-15", dia_descanso: 0 },
      { nombre: "José Pérez", numero_empleado: "102", email: null, curp: null,
        centro_trabajo_id: "c1", fecha_ingreso: "2026-04-01", dia_descanso: 6 },
    ]);
  });

  it("acepta encabezados con acentos y en otro orden, y centros sin acentos ni mayúsculas", () => {
    const csv = "Fecha de ingreso,Nombre completo,Número de empleado,Centro de trabajo,Día de descanso\n01/02/2026,Ana,7,sucursal norte,Sábado";
    const r = validarImportacion(csv, CENTROS, SIN_EXISTENTES, HOY);
    expect(r.errores).toEqual([]);
    expect(r.trabajadores[0]).toMatchObject({ nombre: "Ana", numero_empleado: "7", centro_trabajo_id: "c2", dia_descanso: 6 });
  });

  it("si hay un solo centro, no hace falta indicarlo", () => {
    const r = validarImportacion("nombre,numero_empleado,fecha_ingreso\nAna,1,01/01/2026", [CENTROS[0]!], SIN_EXISTENTES, HOY);
    expect(r.trabajadores[0]?.centro_trabajo_id).toBe("c1");
  });

  it("reporta cada error con su renglón y no da de alta a nadie si hay alguno", () => {
    const csv = [
      "nombre,numero_empleado,correo,curp,centro,fecha_ingreso,dia_descanso",
      "Bien,1,,,Matriz,01/01/2026,",
      ",2,,,Matriz,01/01/2026,",
      "Repetido,1,,,Matriz,01/01/2026,",
      "Correo,3,no-es-correo,,Matriz,01/01/2026,",
      "Curp,4,,ABC,Matriz,01/01/2026,",
      "Centro,5,,,Bodega,01/01/2026,",
      "Fecha,6,,,Matriz,31/02/2026,",
      "Futuro,7,,,Matriz,01/01/2027,",
      "Descanso,8,,,Matriz,01/01/2026,feriado",
      "Sin metodo,,,,Matriz,01/01/2026,",
      "Existente,900,,,Matriz,01/01/2026,",
      "Existente correo,9,YA@EXISTE.MX,,Matriz,01/01/2026,",
    ].join("\n");
    const r = validarImportacion(csv, CENTROS, { numeros: ["900"], correos: ["ya@existe.mx"] }, HOY);
    expect(r.trabajadores).toEqual([]);
    expect(r.errores.map((e) => e.fila)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(r.errores[0]!.mensaje).toContain("falta el nombre");
    expect(r.errores[1]!.mensaje).toContain("el número 1 ya existe o está repetido");
    expect(r.errores[4]!.mensaje).toContain('no existe el centro "Bodega"');
    expect(r.errores[8]!.mensaje).toContain("número de empleado (kiosco) o correo (app)");
  });

  it("exige las columnas mínimas y un límite de renglones", () => {
    expect(validarImportacion("nombre\nAna", CENTROS, SIN_EXISTENTES, HOY).errores[0]!.mensaje).toContain("fecha_ingreso");
    expect(validarImportacion("", CENTROS, SIN_EXISTENTES, HOY).errores[0]!.mensaje).toContain("no tiene renglones");
    const muchos = ["nombre,numero_empleado,fecha_ingreso", ...Array.from({ length: 501 }, (_, i) => `P${i},${i},01/01/2026`)].join("\n");
    expect(validarImportacion(muchos, [CENTROS[0]!], SIN_EXISTENTES, HOY).errores[0]!.mensaje).toContain("Máximo 500");
  });
});
