import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  accionesValidas,
  confirmacion,
  firmaValida,
  idBoton,
  idClienteDe,
  intencionDe,
  cuerpoParaAsistente,
  firmar,
  conAviso,
  huellaResumen,
  rangoSemana,
  revisionSemana,
  textoSemana,
  VIGENCIA_REVISION_S,
  mensajesDe,
  menu,
  VIGENCIA_BOTON_S,
  type MensajeEntrante,
} from "./whatsapp";

const AHORA = 1_800_000_000;
const msj = (p: Partial<MensajeEntrante>): MensajeEntrante => ({
  id: "wamid.X", telefono: "5215512345678", enviadoEn: AHORA, texto: null, boton: null,
  origen: { metadatos: { phone_number_id: "111" }, contactos: [], crudo: {} }, ...p,
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
    expect(r[0]!.origen.crudo).toMatchObject({ id: "a", type: "text" });
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
  it("distingue el código de activación (6 dígitos)", () => {
    expect(intencionDe(msj({ texto: "739104" }), AHORA)).toEqual({ clase: "codigo", codigo: "739104" });
    expect(intencionDe(msj({ texto: "Activar 739 104" }), AHORA)).toEqual({ clase: "codigo", codigo: "739104" });
    expect(intencionDe(msj({ texto: "7391" }), AHORA)).toEqual({ clase: "otro" });
    expect(intencionDe(msj({ texto: "1234567" }), AHORA)).toEqual({ clase: "otro" });
  });
  it("los botones vencen", () => {
    const boton = idBoton("entrada", AHORA);
    expect(intencionDe(msj({ boton }), AHORA + VIGENCIA_BOTON_S)).toEqual({ clase: "checar", tipo: "entrada" });
    expect(intencionDe(msj({ boton }), AHORA + VIGENCIA_BOTON_S + 1)).toEqual({ clase: "boton_vencido" });
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

describe("conformidad semanal", () => {
  const semana = {
    dias: [
      { fecha: "2026-11-02", diaSemana: 1, tipo: "diurna", trabajadoMin: 480, ordinariaMin: 480, extraDobleMin: 0, extraTripleMin: 0 },
      { fecha: "2026-11-03", diaSemana: 2, tipo: "diurna", trabajadoMin: 0, ordinariaMin: 0, extraDobleMin: 0, extraTripleMin: 0 },
      { fecha: "2026-11-04", diaSemana: 3, tipo: "nocturna", trabajadoMin: 540, ordinariaMin: 420, extraDobleMin: 120, extraTripleMin: 0 },
    ],
    totales: { trabajadoMin: 1020, ordinariaMin: 900, extraDobleMin: 120, extraTripleMin: 0 },
  } as Parameters<typeof textoSemana>[1];
  const turnos = [
    { inicio: "2026-11-02T09:00", fin: "2026-11-02T18:00", pausas: [{ inicio: "2026-11-02T13:00", fin: "2026-11-02T14:00", puedeSalir: true }] },
    { inicio: "2026-11-04T22:00", fin: "2026-11-05T07:00" },
  ];

  it("el resumen lista turnos, pausas, total, extras e incidencias", () => {
    const t = textoSemana("2026-11-02", semana, turnos, [{ codigo: "ENTRADA_SIN_SALIDA", eventoId: 1, mensaje: "Entrada sin salida." }]);
    expect(t.split("\n")).toEqual([
      "*Semana del 2 al 8 de nov*",
      "Lun 2: 09:00–18:00 (pausa 13:00–14:00) · 8 h 00",
      "Mié 4: 22:00–07:00 (+1) · 9 h 00",
      "Total trabajado: 17 h 00",
      "Ordinario 15 h 00 · extra doble 2 h 00 · extra triple 0 h 00",
      "⚠ Entrada sin salida.",
    ]);
    expect(rangoSemana("2026-11-30")).toBe("30 de nov al 6 de dic");
  });
  it("los botones de conformidad llevan la semana y la huella de lo mostrado", () => {
    const huella = huellaResumen({ semana: "2026-11-02", eventoIds: [1, 2] });
    expect(huella).toMatch(/^[0-9a-f]{12}$/);
    expect(huella).not.toBe(huellaResumen({ semana: "2026-11-02", eventoIds: [1, 3] }));
    const r = revisionSemana("2026-11-02", "resumen", huella, AHORA);
    expect(r.texto).toContain("Si no respondes, no cuenta como conformidad.");
    expect(r.extra!.map((b) => b.titulo)).toEqual(["Estoy conforme", "No es correcto"]);
    expect(intencionDe(msj({ boton: r.extra![0]!.id }), AHORA)).toEqual({ clase: "conforme", lunes: "2026-11-02", huella });
    expect(intencionDe(msj({ boton: r.extra![1]!.id }), AHORA)).toEqual({ clase: "objetar", lunes: "2026-11-02" });
    expect(intencionDe(msj({ boton: r.extra![0]!.id }), AHORA + VIGENCIA_REVISION_S + 1)).toEqual({ clase: "boton_vencido" });
  });
  it("un resumen largo va en un mensaje aparte", () => {
    const r = revisionSemana("2026-11-02", "x".repeat(1200), "0".repeat(12), AHORA);
    expect(r.previo).toHaveLength(1200);
    expect(r.texto.length).toBeLessThan(200);
  });
  it("la conformidad no se acepta por texto, solo se puede pedir ver la semana", () => {
    for (const t of ["conforme", "estoy conforme", "sí", "ok"]) expect(intencionDe(msj({ texto: t }), AHORA)).toEqual({ clase: "otro" });
    expect(intencionDe(msj({ texto: "Revisar semana" }), AHORA)).toEqual({ clase: "ver_semana", lunes: null });
  });
  it("el aviso agrega el botón solo si cabe (máximo 3)", () => {
    const pendientes = [{ lunes: "2026-11-02" }, { lunes: "2026-11-09" }];
    const r = conAviso({ texto: "Hola", botones: ["inicio_pausa", "salida"] }, pendientes, AHORA);
    expect(r.texto).toContain("Tienes 2 semanas por revisar.");
    expect(r.extra).toEqual([{ id: `sem:2026-11-02:${AHORA + VIGENCIA_REVISION_S}`, titulo: "Revisar semana" }]);
    expect(conAviso({ texto: "Hola" }, [], AHORA)).toEqual({ texto: "Hola" });
    expect(conAviso({ texto: "Hola", botones: ["entrada"], extra: [{ id: "a", titulo: "A" }, { id: "b", titulo: "B" }] }, pendientes, AHORA).extra).toHaveLength(2);
  });
});

describe("reenvío al asistente", () => {
  it("reenvía solo el mensaje de esa persona, con su contacto, y la firma es válida", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "111", display_phone_number: "5215500000000" },
        contacts: [{ wa_id: "5215500000001", profile: { name: "Prospecto" } }, { wa_id: "5215512345678", profile: { name: "Trabajadora" } }],
        messages: [
          { id: "a", from: "5215500000001", timestamp: "1800000000", type: "text", text: { body: "¿Qué es Checador?" } },
          { id: "b", from: "5215512345678", timestamp: "1800000000", type: "text", text: { body: "Ese día salí a las 19:00" } },
        ],
      } }] }],
    };
    const [prospecto] = mensajesDe(payload, "111");
    const cuerpo = cuerpoParaAsistente(prospecto!);
    const v = JSON.parse(cuerpo).entry[0].changes[0].value;
    expect(v.messages).toEqual([payload.entry[0]!.changes[0]!.value.messages[0]]);
    expect(v.contacts).toEqual([{ wa_id: "5215500000001", profile: { name: "Prospecto" } }]);
    expect(v.metadata.phone_number_id).toBe("111");
    expect(cuerpo).not.toContain("19:00");
    expect(firmaValida(cuerpo, firmar(cuerpo, "secreto"), "secreto")).toBe(true);
  });
});
