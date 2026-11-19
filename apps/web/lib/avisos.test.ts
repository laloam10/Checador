import { describe, expect, it } from "vitest";
import { contenidoAviso, resultadoEntrega, servicioPermitido, suscripcionValida } from "./avisos";

const P256 = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

describe("contenido de los avisos", () => {
  it("no muestra horas ni datos de la persona", () => {
    for (const tipo of ["semana", "acuerdo", "correccion"] as const) {
      const c = contenidoAviso(tipo, 1, "/registros?semana=2026-11-02");
      expect(`${c.titulo} ${c.cuerpo}`).not.toMatch(/\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}/);
    }
  });
  it("agrupa varios avisos del mismo tipo", () => {
    expect(contenidoAviso("semana", 1, "/").titulo).toBe("Tienes una semana por revisar");
    expect(contenidoAviso("semana", 3, "/").titulo).toBe("Tienes 3 semanas por revisar");
    expect(contenidoAviso("correccion", 2, "/").titulo).toBe("Tu empresa modificó 2 de tus registros");
    expect(contenidoAviso("semana", 1, "/").cuerpo).toContain("voluntario");
  });
  it("solo liga a rutas propias", () => {
    expect(contenidoAviso("acuerdo", 1, "/acuerdo").url).toBe("/acuerdo");
    expect(contenidoAviso("acuerdo", 1, "https://otro.sitio/x").url).toBe("/");
    expect(contenidoAviso("acuerdo", 1, "//otro.sitio").url).toBe("/");
  });
});

describe("servicios de entrega", () => {
  it("acepta los de los navegadores", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://web.push.apple.com/QK123",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://wns2-ch1p.notify.windows.com/w/?token=x",
    ]) expect(servicioPermitido(e)).toBe(true);
  });
  it("rechaza cualquier otro destino", () => {
    for (const e of [
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.mx/x",
      "https://evil.mx/fcm.googleapis.com",
      "https://fcm.googleapis.com:8443/x",
      "https://usuario@fcm.googleapis.com/x",
      "http://127.0.0.1:9000/x",
      "no es url",
    ]) expect(servicioPermitido(e)).toBe(false);
  });
  it("las pruebas locales agregan hosts de forma explícita", () => {
    expect(servicioPermitido("http://127.0.0.1:54397/push/1", "127.0.0.1:54397")).toBe(true);
    expect(servicioPermitido("http://127.0.0.1:54398/push/1", "127.0.0.1:54397")).toBe(false);
  });
  it("valida la suscripción del navegador", () => {
    const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: P256, auth: AUTH } };
    expect(suscripcionValida(ok)).toEqual({ endpoint: ok.endpoint, p256dh: P256, auth: AUTH });
    expect(suscripcionValida({ ...ok, endpoint: "https://evil.mx/x" })).toBeNull();
    expect(suscripcionValida({ ...ok, keys: { p256dh: "corta", auth: AUTH } })).toBeNull();
    expect(suscripcionValida({ ...ok, keys: { p256dh: P256 } })).toBeNull();
    expect(suscripcionValida(null)).toBeNull();
  });
  it("clasifica la respuesta del servicio", () => {
    expect(resultadoEntrega(201)).toBe("exitosa");
    expect(resultadoEntrega(410)).toBe("caducada");
    expect(resultadoEntrega(404)).toBe("caducada");
    expect(resultadoEntrega(429)).toBe("fallida");
    expect(resultadoEntrega(500)).toBe("fallida");
  });
});
