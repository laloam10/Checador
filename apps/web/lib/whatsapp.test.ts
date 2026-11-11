import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  accionesValidas,
  confirmacion,
  firmaValida,
  idBoton,
  idClienteDe,
  intencionDe,
  mensajesDe,
  menu,
  VIGENCIA_BOTON_S,
  type MensajeEntrante,
} from "./whatsapp";

const AHORA = 1_800_000_000;
const msj = (p: Partial<MensajeEntrante>): MensajeEntrante => ({
  id: "wamid.X", telefono: "5215512345678", enviadoEn: AHORA, texto: null, boton: null, ...p,
});

describe("firma de Meta", () => {
  const secreto = "secreto-de-la-app";
  const cuerpo = '{"object":"whatsapp_business_account"}';
  const firma = "sha256=" + createHmac("sha256", secreto).update(cuerpo).digest("hex");
  it("acepta el cuerpo firmado", () => expect(firmaValida(cuerpo, firma, secreto)).toBe(true));
  it("rechaza un cuerpo alterado", () => expect(firmaValida(cuerpo + " ", firma, secreto)).toBe(false));
  it("rechaza sin cabecera o con otro secreto", () => {
    expect(firmaValida(cuerpo, null, secreto)).toBe(false);
    expect(firmaValida(cuerpo, firma, "otro")).toBe(false);
    expect(firmaValida(cuerpo, "sha256=zz", secreto)).toBe(false);
  });
});

describe("mensajesDe", () => {
  const payload = (mensajes: unknown[], idNumero = "111") => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: idNumero }, messages: mensajes } }] }],
  });
  it("lee texto y botones", () => {
    const r = mensajesDe(
      payload([
        { id: "a", from: "5215512345678", timestamp: "1800000000", type: "text", text: { body: "Entrada" } },
        { id: "b", from: "5215512345678", timestamp: "1800000001", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "chk:salida:1800000600" } } },
        { id: "c", from: "5215512345678", timestamp: "1800000002", type: "image" },
      ]),
      "111",
    );
    expect(r.map((m) => [m.id, m.texto, m.boton])).toEqual([
      ["a", "Entrada", null],
      ["b", null, "chk:salida:1800000600"],
      ["c", null, null],
    ]);
  });
  it("ignora otros números, estados de entrega y remitentes inválidos", () => {
    expect(mensajesDe(payload([{ id: "a", from: "5215512345678", timestamp: "1", type: "text", text: { body: "x" } }], "999"), "111")).toEqual([]);
    expect(mensajesDe({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, statuses: [{}] } }] }] }, "111")).toEqual([]);
    expect(mensajesDe(payload([{ id: "a", from: "abc", timestamp: "1", type: "text" }]), "111")).toEqual([]);
    expect(mensajesDe(null, "111")).toEqual([]);
  });
});

describe("intencionDe", () => {
  it("reconoce frases completas", () => {
    expect(intencionDe(msj({ texto: " Entrada " }), AHORA)).toEqual({ clase: "checar", tipo: "entrada" });
    expect(intencionDe(msj({ texto: "Ya llegué" }), AHORA)).toEqual({ clase: "checar", tipo: "entrada" });
    expect(intencionDe(msj({ texto: "checar salida" }), AHORA)).toEqual({ clase: "checar", tipo: "salida" });
    expect(intencionDe(msj({ texto: "Comida" }), AHORA)).toEqual({ clase: "checar", tipo: "inicio_pausa" });
    expect(intencionDe(msj({ texto: "terminar pausa" }), AHORA)).toEqual({ clase: "checar", tipo: "fin_pausa" });
    expect(intencionDe(msj({ texto: "Regresé" }), AHORA)).toEqual({ clase: "checar", tipo: "fin_pausa" });
  });
  it("no registra por frases ambiguas", () => {
    for (const t of ["no he salido", "¿ya quedó mi entrada?", "salida a las 5", "hola", ""]) {
      expect(intencionDe(msj({ texto: t }), AHORA)).toEqual({ clase: "otro" });
    }
  });
  it("distingue el PIN", () => {
    expect(intencionDe(msj({ texto: "7391" }), AHORA)).toEqual({ clase: "pin", pin: "7391" });
    expect(intencionDe(msj({ texto: "1234567" }), AHORA)).toEqual({ clase: "otro" });
  });
  it("los botones vencen", () => {
    const boton = idBoton("entrada", AHORA);
    expect(intencionDe(msj({ boton }), AHORA + VIGENCIA_BOTON_S)).toEqual({ clase: "checar", tipo: "entrada" });
    expect(intencionDe(msj({ boton }), AHORA + VIGENCIA_BOTON_S + 1)).toEqual({ clase: "boton_vencido", tipo: "entrada" });
    expect(intencionDe(msj({ boton: "chk:correccion:9999999999" }), AHORA)).toEqual({ clase: "otro" });
  });
});

describe("respuestas", () => {
  it("solo ofrece lo que el estado permite", () => {
    expect(accionesValidas("fuera")).toEqual(["entrada"]);
    expect(accionesValidas("trabajando")).toEqual(["inicio_pausa", "salida"]);
    expect(accionesValidas("en_pausa")).toEqual(["fin_pausa"]);
    expect(menu("María López", "trabajando", "09:02").texto).toContain("María, estás en turno. Entrada registrada a las 09:02.");
  });
  it("la confirmación lleva hora local y número de registro", () => {
    const r = confirmacion("entrada", "2026-11-11T09:02", 41, "Empresa A", false);
    expect(r.texto).toContain("Entrada registrada a las 09:02 del 11/11.");
    expect(r.texto).toContain("Empresa A · registro n.º 41");
    expect(r.botones).toEqual(["inicio_pausa", "salida"]);
    expect(confirmacion("salida", "2026-11-11T18:00", 42, "Empresa A", true).botones).toBeUndefined();
  });
  it("idClienteDe es estable y con forma de UUID", () => {
    expect(idClienteDe("wamid.A")).toBe(idClienteDe("wamid.A"));
    expect(idClienteDe("wamid.A")).not.toBe(idClienteDe("wamid.B"));
    expect(idClienteDe("wamid.A")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
