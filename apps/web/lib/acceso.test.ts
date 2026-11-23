import { describe, expect, it } from "vitest";
import { permitidaConBloqueo, rutaSiguiente } from "./acceso";

describe("permitidaConBloqueo", () => {
  it("con la sesión bloqueada solo se abre el desbloqueo, la entrada y lo indispensable", () => {
    for (const r of ["/desbloquear", "/entrar", "/api/salir", "/api/acceso/desbloquear", "/api/despliegue", "/api/hora"]) {
      expect(permitidaConBloqueo(r)).toBe(true);
    }
    for (const r of ["/", "/registros", "/acceso", "/panel", "/api/eventos", "/api/conformidades", "/api/acuerdos/firmar", "/desbloquear/x"]) {
      expect(permitidaConBloqueo(r)).toBe(false);
    }
  });
});

describe("rutaSiguiente", () => {
  it("solo acepta rutas propias", () => {
    expect(rutaSiguiente("/registros")).toBe("/registros");
    expect(rutaSiguiente("//otro.mx")).toBe("/");
    expect(rutaSiguiente("/\\otro.mx")).toBe("/");
    expect(rutaSiguiente("https://otro.mx")).toBe("/");
    expect(rutaSiguiente("/desbloquear")).toBe("/");
    expect(rutaSiguiente(null)).toBe("/");
  });
});
