import { describe, expect, it } from "vitest";
import { hayVersionNueva } from "./despliegue";

describe("hayVersionNueva", () => {
  it("avisa solo si el servidor tiene otro despliegue", () => {
    expect(hayVersionNueva("abc123", { despliegue: "abc123" })).toBe(false);
    expect(hayVersionNueva("abc123", { despliegue: "def456" })).toBe(true);
  });

  it("ignora respuestas vacías o extrañas (p. ej. una página de error o de inicio de sesión)", () => {
    expect(hayVersionNueva("abc123", null)).toBe(false);
    expect(hayVersionNueva("abc123", "def456")).toBe(false);
    expect(hayVersionNueva("abc123", {})).toBe(false);
    expect(hayVersionNueva("abc123", { despliegue: "" })).toBe(false);
    expect(hayVersionNueva("abc123", { despliegue: 7 })).toBe(false);
    expect(hayVersionNueva("abc123", { despliegue: "<html>" })).toBe(false);
  });
});
