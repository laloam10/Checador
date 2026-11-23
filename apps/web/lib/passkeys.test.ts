import { describe, expect, it } from "vitest";
import { bytesDeUuid, nombreDispositivo, parteConfiable, retoDeRespuesta } from "./passkeys";

const datosCliente = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("passkeys", () => {
  it("el dominio de la passkey es el de la página", () => {
    expect(parteConfiable(new URL("https://checador.jemba.mx/api/acceso/passkey/opciones"))).toEqual({
      rpID: "checador.jemba.mx",
      origen: "https://checador.jemba.mx",
    });
    expect(parteConfiable(new URL("http://localhost:3000/x")).origen).toBe("http://localhost:3000");
  });

  it("lee el reto que firmó el teléfono y rechaza lo extraño", () => {
    const reto = "a".repeat(43);
    expect(retoDeRespuesta({ response: { clientDataJSON: datosCliente({ type: "webauthn.get", challenge: reto }) } })).toBe(reto);
    expect(retoDeRespuesta({ response: { clientDataJSON: datosCliente({ challenge: "corto" }) } })).toBeNull();
    expect(retoDeRespuesta({ response: { clientDataJSON: "no-es-json" } })).toBeNull();
    expect(retoDeRespuesta({})).toBeNull();
    expect(retoDeRespuesta(null)).toBeNull();
  });

  it("nombra el dispositivo sin guardar el agente completo", () => {
    expect(nombreDispositivo("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Teléfono Android");
    expect(nombreDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(nombreDispositivo(null)).toBe("Este dispositivo");
  });

  it("usa los 16 bytes del UUID como identificador del usuario", () => {
    expect(bytesDeUuid("00000000-0000-0000-0000-00000000000d")).toHaveLength(16);
  });
});
