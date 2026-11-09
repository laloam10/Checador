// Prueba de punta a punta de los recordatorios de conformidad en Supabase local:
// pg_net envía el lote a un Resend simulado; se revisan el contenido, el seguimiento
// del estado y el límite de un correo cada 6 días.
//
// Requisitos: `npx supabase start` con las migraciones aplicadas y psql. No necesita la app.
// Uso: node apps/web/e2e/recordatorios.e2e.mjs
// RESEND_SIMULADO_HOST: IP con la que el contenedor de la base alcanza esta máquina
// (por omisión, la puerta de enlace de la red de Docker de Supabase).
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (q) => execFileSync("psql", [DB, "-XtAq", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const afirmar = (c, d) => {
  if (!c) throw new Error(`FALLO: ${d}`);
  console.log("✓", d);
};
const esperar = async (cond, d, ms = 20000) => {
  for (const fin = Date.now() + ms; Date.now() < fin; await new Promise((r) => setTimeout(r, 300))) if (await cond()) return;
  throw new Error(`FALLO: no ocurrió: ${d}`);
};

const host =
  process.env.RESEND_SIMULADO_HOST ??
  execFileSync("docker", ["inspect", "supabase_db_checador", "-f", "{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}"], {
    encoding: "utf8",
  }).trim();

// --- Resend simulado ---
const recibidas = [];
let respuesta = { codigo: 200, cuerpo: (n) => ({ data: Array.from({ length: n }, () => ({ id: randomUUID() })) }) };
const servidor = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const json = JSON.parse(cuerpo);
    recibidas.push({ ruta: req.url, autorizacion: req.headers.authorization, correos: json });
    res.writeHead(respuesta.codigo, { "Content-Type": "application/json" });
    res.end(JSON.stringify(respuesta.cuerpo(json.length)));
  });
});
await new Promise((r) => servidor.listen(0, "0.0.0.0", r));
const puerto = servidor.address().port;

const secretos = {
  checador_resend_llave: "re_llave_de_prueba",
  checador_url_app: "https://checador.ejemplo.mx/",
  checador_remitente: "Reloj Checador <no-responder@checador.ejemplo.mx>",
  checador_resend_url: `http://${host}:${puerto}/emails/batch`,
};
const borrarSecretos = () => sql(`delete from vault.secrets where name in (${Object.keys(secretos).map((k) => `'${k}'`).join(",")})`);

try {
  borrarSecretos();
  for (const [k, v] of Object.entries(secretos)) sql(`select vault.create_secret('${v}', '${k}')`);

  // --- Datos: una empresa con una trabajadora que checó la semana pasada ---
  const s = Date.now().toString(36);
  const crear = (nombre, correo) => {
    const dueno = randomUUID();
    sql(`insert into auth.users (id, email) values ('${dueno}', 'dueno.${s}.${nombre}@ejemplo.mx')`);
    const fila = sql(`
      select set_config('request.jwt.claim.sub', '${dueno}', false);
      with e as (select public.crear_empresa('Recordatorios ${nombre} ${s}') as id),
           c as (insert into public.centros_trabajo (empresa_id, nombre) select id, 'Matriz' from e returning empresa_id, id),
           t as (insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, email, fecha_ingreso)
                 select empresa_id, id, 'Lucía <Prueba>', '${correo}', '2026-01-01' from c returning empresa_id, id)
      select empresa_id || ' ' || id from t;`).split("\n").pop();
    const [empresa, trabajador] = fila.split(" ");
    sql(`
      select set_config('request.jwt.claim.sub', '${dueno}', false);
      insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
      values ('${empresa}', '${trabajador}', 'entrada', 'panel', 'Prueba de recordatorios',
              (date_trunc('week', now() at time zone 'America/Mexico_City') - interval '6 days' + interval '9 hours')
                at time zone 'America/Mexico_City');`);
    return { empresa, trabajador };
  };
  const correo1 = `lucia.${s}@ejemplo.mx`;
  const t1 = crear("uno", correo1);

  // --- Envío correcto ---
  const n1 = Number(sql("select public.enviar_recordatorios_conformidad()"));
  afirmar(n1 >= 1, `la función puso ${n1} correo(s) en cola`);
  await esperar(() => recibidas.some((r) => r.correos.some((c) => c.to?.[0] === correo1)), "llega el lote al Resend simulado");
  const lote = recibidas.find((r) => r.correos.some((c) => c.to?.[0] === correo1));
  const c1 = lote.correos.find((c) => c.to[0] === correo1);
  afirmar(lote.ruta === "/emails/batch" && lote.autorizacion === "Bearer re_llave_de_prueba", "usa /emails/batch con la llave de Vault");
  afirmar(Array.isArray(lote.correos) && lote.correos.length <= 100, "el cuerpo es un arreglo de hasta 100 correos");
  afirmar(c1.from === secretos.checador_remitente && c1.subject === "Tienes semanas por revisar en Checador", "remitente y asunto");
  const lunes = sql(`select (date_trunc('week', now() at time zone 'America/Mexico_City') - interval '7 days')::date`);
  afirmar(c1.html.includes(`https://checador.ejemplo.mx/registros?semana=${lunes}`), `enlace a la semana del ${lunes} sin doble diagonal`);
  afirmar(c1.html.includes("Lucía &lt;Prueba&gt;") && !c1.html.includes("<Prueba>"), "el nombre se escapa en el HTML");
  afirmar(c1.text.includes("voluntaria"), "versión de texto incluida");

  await esperar(
    () => sql(`select count(*) from net._http_response r join public.recordatorios_conformidad x on x.solicitud_id = r.id where x.trabajador_id = '${t1.trabajador}'`) === "1",
    "pg_net guarda la respuesta",
  );
  sql("select public.revisar_envios_recordatorios()");
  afirmar(sql(`select estado from public.recordatorios_conformidad where trabajador_id = '${t1.trabajador}'`) === "enviado", "el envío queda como enviado");

  // --- Límite: no se repite en 6 días ---
  const antes = recibidas.length;
  sql("select public.enviar_recordatorios_conformidad()");
  await new Promise((r) => setTimeout(r, 2000));
  afirmar(!recibidas.slice(antes).some((r) => r.correos.some((c) => c.to?.[0] === correo1)), "no se vuelve a enviar a la misma persona");

  // --- Envío rechazado por Resend ---
  respuesta = { codigo: 422, cuerpo: () => ({ name: "validation_error", message: "Dominio no verificado" }) };
  const correo2 = `luis.${s}@ejemplo.mx`;
  const t2 = crear("dos", correo2);
  sql("select public.enviar_recordatorios_conformidad()");
  await esperar(
    () => sql(`select count(*) from net._http_response r join public.recordatorios_conformidad x on x.solicitud_id = r.id where x.trabajador_id = '${t2.trabajador}'`) === "1",
    "pg_net guarda la respuesta con error",
  );
  sql("select public.revisar_envios_recordatorios()");
  const [estado, detalle] = sql(`select estado || '|' || detalle from public.recordatorios_conformidad where trabajador_id = '${t2.trabajador}'`).split("|");
  afirmar(estado === "fallido" && detalle.includes("HTTP 422") && detalle.includes("Dominio no verificado"), "un rechazo queda como fallido con el motivo");
  afirmar(
    sql(`select count(*) from public.conformidades_por_recordar() where trabajador_id = '${t2.trabajador}'`) === "1",
    "un envío fallido se reintenta en la siguiente corrida",
  );
  console.log("Recordatorios: todo bien.");
} finally {
  borrarSecretos();
  servidor.close();
}
