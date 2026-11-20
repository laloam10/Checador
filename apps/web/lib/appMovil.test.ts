import { describe, expect, it } from "vitest";
import { clienteApp, compararVersiones, origenAppPermitido, rutaDeApp, tokenDe } from "./appMovil";

describe("app instalada", () => {
  it("solo acepta los orígenes de Capacitor", () => {
    expect(origenAppPermitido("capacitor://localhost")).toBe(true);
    expect(origenAppPermitido("https://localhost")).toBe(true);
    expect(origenAppPermitido("https://localhost:8443")).toBe(false);
    expect(origenAppPermitido("http://localhost")).toBe(false);
    expect(origenAppPermitido("https://evil.mx")).toBe(false);
    expect(origenAppPermitido(null)).toBe(false);
    expect(origenAppPermitido("http://127.0.0.1:5173", "http://127.0.0.1:5173")).toBe(true);
  });
  it("solo en las rutas que usa la app", () => {
    expect(rutaDeApp("/api/eventos")).toBe(true);
    expect(rutaDeApp("/api/exportar")).toBe(false);
    expect(rutaDeApp("/api/kiosco/checar")).toBe(false);
    expect(rutaDeApp("/api/eventos/otra")).toBe(false);
  });
  it("lee el token de sesión", () => {
    expect(tokenDe("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
    expect(tokenDe("bearer aaa.bbb.ccc")).toBeNull();
    expect(tokenDe("Bearer no-es-jwt")).toBeNull();
    expect(tokenDe(null)).toBeNull();
  });
  it("la plataforma y la versión son solo informativas y se limpian", () => {
    expect(clienteApp("Android", "1.2.3")).toEqual({ plataforma: "android", version: "1.2.3" });
    expect(clienteApp("<script>", "1.2")).toEqual({ plataforma: "desconocida", version: null });
  });
  it("compara versiones", () => {
    expect(compararVersiones("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compararVersiones("1.0.0", "1.0.0")).toBe(0);
    expect(compararVersiones("0.9.9", "1.0.0")).toBeLessThan(0);
  });
});
