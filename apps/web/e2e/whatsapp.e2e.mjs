// Prueba de punta a punta de la checada por WhatsApp: se envían al webhook cuerpos firmados
// como los de Meta y una API de WhatsApp simulada recibe las respuestas.
//
// Requisitos: Supabase local con las migraciones aplicadas, psql y la app corriendo con:
//   WHATSAPP_VERIFY_TOKEN=verificacion-e2e WHATSAPP_APP_SECRET=secreto-app-e2e WHATSAPP_TOKEN=token-e2e
//   WHATSAPP_PHONE_ID=100200300 WHATSAPP_GRAPH_URL=http://127.0.0.1:54399
//   WHATSAPP_SECRETO_SERVICIO=secreto-de-servicio-e2e-0123456789abcdef
// Uso: node apps/web/e2e/whatsapp.e2e.mjs
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ID_NUMERO = "100200300";
const SECRETO_APP = "secreto-app-e2e";
const SECRETO_SERVICIO = "secreto-de-servicio-e2e-0123456789abcdef";

const sql = (q) => execFileSync("psql", [DB, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const afirmar = (c, d) => {
  if (!c) throw new Error(`FALLO: ${d}`);
  console.log("✓", d);
};

// --- API de WhatsApp simulada ---
const enviados = [];
const servidor = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    enviados.push({ ruta: req.url, autorizacion: req.headers.authorization, ...JSON.parse(cuerpo) });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }));
  });
});
await new Promise((r) => servidor.listen(54399, "127.0.0.1", r));

const ahoraS = () => Math.floor(Date.now() / 1000);
/** Envía un mensaje al webhook y devuelve la respuesta que el bot mandó a WhatsApp. */
async function enviar(de, contenido, { id = `wamid.${randomUUID()}`, ts = ahoraS(), firma, idNumero = ID_NUMERO } = {}) {
  const mensaje =
    "boton" in contenido
      ? { type: "interactive", interactive: { type: "button_reply", button_reply: { id: contenido.boton, title: "x" } } }
      : { type: "text", text: { body: contenido.texto } };
  const cuerpo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: idNumero }, messages: [{ id, from: de, timestamp: String(ts), ...mensaje }] } }] }],
  });
  const antes = enviados.length;
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": firma ?? "sha256=" + createHmac("sha256", SECRETO_APP).update(cuerpo).digest("hex"),
    },
    body: cuerpo,
  });
  const r = enviados[antes];
  return {
    http: res.status,
    respuestas: enviados.length - antes,
    para: r?.to,
    texto: r?.type === "interactive" ? r.interactive.body.text : r?.text?.body,
    botones: r?.type === "interactive" ? r.interactive.action.buttons.map((b) => b.reply) : [],
  };
}

try {
  // --- Datos: una empresa con una trabajadora con celular ---
  const s = Date.now().toString(36);
  const cel = "55" + String(Date.now()).slice(-8);
  const deWhatsApp = `521${cel}`; // así lo entrega WhatsApp en México
  const dueno = randomUUID();
  sql(`insert into auth.users (id, email) values ('${dueno}', 'dueno.wa.${s}@ejemplo.mx')`);
  sql(`select public.configurar_secreto_servicio('whatsapp', '${SECRETO_SERVICIO}')`);
  const trabajador = sql(`
    select set_config('request.jwt.claim.sub', '${dueno}', false);
    with e as (select public.crear_empresa('WhatsApp ${s}') as id),
         c as (insert into public.centros_trabajo (empresa_id, nombre) select id, 'Matriz' from e returning empresa_id, id),
         t as (insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, telefono)
               select empresa_id, id, 'Wendy Prueba', '77', '2026-01-01', '${cel}' from c returning id)
    select id from t;`).split("\n").pop();
  const generarCodigo = () =>
    sql(`select set_config('request.jwt.claim.sub', '${dueno}', false); set role authenticated; select public.generar_codigo_whatsapp('${trabajador}');`).split("\n").pop();
  const eventos = () => sql(`select coalesce(string_agg(tipo || ':' || origen, ',' order by id), '') from public.eventos where trabajador_id = '${trabajador}'`);

  // --- Verificación del webhook y firma ---
  const v = (token) => fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`);
  const okV = await v("verificacion-e2e");
  afirmar(okV.status === 200 && (await okV.text()) === "12345", "Meta verifica el webhook con el token correcto");
  afirmar((await v("otro")).status === 403, "con otro token se rechaza");
  let r = await enviar(deWhatsApp, { texto: "entrada" }, { firma: "sha256=" + "0".repeat(64) });
  afirmar(r.http === 401 && r.respuestas === 0, "un cuerpo sin firma válida se rechaza y no se responde");
  r = await enviar(deWhatsApp, { texto: "entrada" }, { idNumero: "999" });
  afirmar(r.http === 200 && r.respuestas === 0, "se ignoran mensajes dirigidos a otro número");

  // --- Número desconocido ---
  r = await enviar("5215500000001", { texto: "hola" });
  afirmar(r.texto.includes("no está registrado") && r.para === "5215500000001", "a un número desconocido se le explica que no está registrado");

  // --- Activación con código de un solo uso ---
  r = await enviar(deWhatsApp, { texto: "entrada" });
  afirmar(r.texto.includes("pide a tu empresa tu código") && eventos() === "", "sin activar no se checa: falta que la empresa genere el código");
  afirmar(enviados.at(-1).autorizacion === "Bearer token-e2e" && enviados.at(-1).ruta === `/${ID_NUMERO}/messages`, "la respuesta va a la API de WhatsApp con el token");
  const codigo = generarCodigo();
  afirmar(/^\d{6}$/.test(codigo), "el empleador genera un código de 6 dígitos");
  r = await enviar(deWhatsApp, { texto: "entrada" });
  afirmar(r.texto.includes("escribe el código de activación") && eventos() === "", "con código pendiente, se pide escribirlo");
  r = await enviar(deWhatsApp, { texto: codigo === "000000" ? "000001" : "000000" });
  afirmar(r.texto.startsWith("Código incorrecto") && r.texto.includes("quedan 4 intentos"), "un código incorrecto no activa y avisa los intentos");
  r = await enviar(deWhatsApp, { texto: `${codigo.slice(0, 3)} ${codigo.slice(3)}` });
  afirmar(r.texto.includes("Listo, Wendy") && r.botones.length === 1 && r.botones[0].title === "Entrada", "el código correcto activa y ofrece la entrada");
  afirmar(sql(`select count(*) from public.codigos_whatsapp where trabajador_id = '${trabajador}'`) === "0", "el código se consume: no queda guardado");

  // --- Checada con botón, reintento de Meta y texto ---
  const idMensaje = `wamid.${randomUUID()}`;
  r = await enviar(deWhatsApp, { boton: r.botones[0].id }, { id: idMensaje });
  afirmar(/✅ Entrada registrada a las \d\d:\d\d/.test(r.texto) && /registro n\.º \d+/.test(r.texto), "el botón registra la entrada y confirma con hora y número de registro");
  afirmar(r.botones.map((b) => b.title).join() === "Iniciar pausa,Salida", "después de la entrada ofrece pausa y salida");
  afirmar(eventos() === "entrada:whatsapp", "el evento queda en la bitácora con origen whatsapp");
  const botonSalida = r.botones[1].id;
  r = await enviar(deWhatsApp, { boton: "chk:entrada:9999999999" }, { id: idMensaje });
  afirmar(r.texto.includes("no se duplicó") || r.texto.includes("No se puede registrar"), "el reintento del mismo mensaje no duplica");
  afirmar(eventos() === "entrada:whatsapp", "sigue habiendo una sola entrada");
  r = await enviar(deWhatsApp, { texto: "Entrada" });
  afirmar(r.texto.includes('No se puede registrar "Entrada"') && eventos() === "entrada:whatsapp", "no registra una entrada con el turno abierto");
  r = await enviar(deWhatsApp, { texto: "¿ya quedó mi entrada?" });
  afirmar(r.texto.includes("estás en turno") && eventos() === "entrada:whatsapp", "una pregunta no registra nada: muestra el estado");

  // --- Mensaje atrasado y botón vencido ---
  r = await enviar(deWhatsApp, { boton: botonSalida }, { ts: ahoraS() - 600 });
  afirmar(r.texto.includes("llegó con retraso") && eventos() === "entrada:whatsapp", "un mensaje entregado con retraso no se registra");
  r = await enviar(deWhatsApp, { boton: `chk:salida:${ahoraS() - 1}` });
  afirmar(r.texto.startsWith("Ese botón ya venció") && eventos() === "entrada:whatsapp", "un botón vencido no registra");
  r = await enviar(deWhatsApp, { texto: "salida" });
  afirmar(r.texto.includes("Salida registrada") && r.botones.length === 0, "la salida por texto se registra");
  afirmar(eventos() === "entrada:whatsapp,salida:whatsapp", "entrada y salida en la bitácora");
  afirmar(
    sql(`select evidencia ->> 'telefono' || ' ' || (evidencia ->> 'wamid' is not null) from public.eventos where trabajador_id = '${trabajador}' limit 1`) === `52${cel} true`,
    "la evidencia guarda el teléfono y el identificador del mensaje",
  );

  // --- El empleador cambia el celular: el anterior deja de servir ---
  sql(`select set_config('request.jwt.claim.sub', '${dueno}', false); set role authenticated; update public.trabajadores set telefono = null where id = '${trabajador}';`);
  r = await enviar(deWhatsApp, { texto: "entrada" });
  afirmar(r.texto.includes("no está registrado") && eventos() === "entrada:whatsapp,salida:whatsapp", "al quitar el celular de la ficha ya no se puede checar");

  console.log("\nWhatsApp: todo correcto.");
} finally {
  servidor.close();
}
