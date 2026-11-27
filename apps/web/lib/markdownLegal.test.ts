import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerDocumentoLegal, partes } from "./markdownLegal";

const leer = (n: string) => readFileSync(join(__dirname, "..", "content", "legal", n), "utf8");

describe("leerDocumentoLegal", () => {
  it.each(["terminos.md", "privacidad.md"])("%s: toma versión y título, y no publica el borrador ni las notas para el abogado", (archivo) => {
    const d = leerDocumentoLegal(leer(archivo));
    expect(d.version).toMatch(/^\d+(\.\d+)*$/);
    expect(d.titulo.length).toBeGreaterThan(5);
    const todo = JSON.stringify(d.bloques);
    expect(todo).not.toMatch(/Notas para el abogado|BORRADOR|PROFECO registrar/);
    expect(d.bloques.some((b) => b.tipo === "tabla")).toBe(true);
  });

  it("arma listas, tablas y párrafos de varias líneas", () => {
    const d = leerDocumentoLegal(["# Título", "", "> Versión 2.1 · 3 de enero de 2027. Borrador.", "", "## 1. Uno",
      "Primera línea", "segunda línea.", "", "- a", "- b que sigue", "  en otra línea", "", "7. siete", "8. ocho", "",
      "| A | B |", "|---|---|", "| 1 | 2 |", "", "## Notas para el abogado", "1. No se publica"].join("\n"));
    expect(d).toEqual({
      titulo: "Título", version: "2.1", fecha: "3 de enero de 2027",
      bloques: [
        { tipo: "h2", texto: "1. Uno" },
        { tipo: "p", texto: "Primera línea segunda línea." },
        { tipo: "ul", items: ["a", "b que sigue en otra línea"] },
        { tipo: "ol", items: ["siete", "ocho"], inicio: 7 },
        { tipo: "tabla", filas: [["A", "B"], ["1", "2"]] },
      ],
    });
  });

  it("separa negritas, código y datos pendientes", () => {
    expect(partes("Hola **Jemba** con `x` y [RFC].")).toEqual([
      { tipo: "texto", texto: "Hola " }, { tipo: "negrita", texto: "Jemba" }, { tipo: "texto", texto: " con " },
      { tipo: "codigo", texto: "x" }, { tipo: "texto", texto: " y " }, { tipo: "pendiente", texto: "[RFC]" }, { tipo: "texto", texto: "." },
    ]);
  });
});
