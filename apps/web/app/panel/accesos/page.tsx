import { headers } from "next/headers";
import QRCode from "qrcode";
import { InvitarAcceso } from "@/components/panel/InvitarAcceso";
import { fechaHora } from "@/lib/formato";
import { esGestor, requierePanel } from "@/lib/panel";
import { cancelarInvitacion, quitarAcceso } from "../acciones";

const ROL: Record<string, string> = { propietario: "Propietario", admin: "Administrador", supervisor: "Supervisor", kiosco: "Kiosco" };

/** Dirección del kiosco en este mismo dominio (pruebas o producción), para el QR. */
async function direccionKiosco() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "checador.jemba.mx";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("127.") || host.startsWith("localhost") ? "http" : "https");
  return { url: `${protocolo}://${host}/kiosco`, corta: `${host}/kiosco` };
}

export default async function Accesos() {
  const ctx = await requierePanel();
  if (!esGestor(ctx.rol)) {
    return <p className="mensaje mensaje-aviso">Solo propietarios y administradores gestionan accesos.</p>;
  }
  const [{ data: miembros }, { data: invitaciones }, { data: centros }, kiosco] = await Promise.all([
    ctx.supabase.rpc("miembros_de_empresa", { p_empresa: ctx.empresa.id }),
    ctx.supabase.from("invitaciones").select("id, email, rol, centro_trabajo_id, creado_en")
      .eq("empresa_id", ctx.empresa.id).is("aceptada_en", null).order("creado_en"),
    ctx.supabase.from("centros_trabajo").select("id, nombre").eq("empresa_id", ctx.empresa.id).order("nombre"),
    direccionKiosco(),
  ]);
  // El QR se genera en el servidor: no se usa ningún servicio externo.
  const qr = `data:image/svg+xml;base64,${Buffer.from(
    await QRCode.toString(kiosco.url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0a2103", light: "#ffffff" } }),
  ).toString("base64")}`;

  const nombreCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));
  const lugar = (rol: string, centro: string | null) =>
    centro ? nombreCentro.get(centro) : rol === "kiosco" ? "Todos los centros" : null;
  const puedeQuitar = (rol: string, userId: string) =>
    userId !== ctx.userId && rol !== "propietario" && (ctx.rol === "propietario" || rol === "supervisor" || rol === "kiosco");

  type Miembro = { user_id: string; email: string; rol: string; centro_trabajo_id: string | null };
  const lista = (miembros ?? []) as Miembro[];
  const pendientes = invitaciones ?? [];
  const opciones = { centros: centros ?? [], puedeAdmin: ctx.rol === "propietario" };

  return (
    <>
      <div className="encabezado-pagina">
        <div>
          <h1>Accesos</h1>
          <p className="ayuda">Quién entra al panel y qué tabletas funcionan como kiosco.</p>
        </div>
        <InvitarAcceso {...opciones} rolInicial="supervisor" etiqueta="Invitar" />
      </div>

      <h2>
        Con acceso <span className="contador">{lista.length}</span>
        {pendientes.length > 0 && <span className="contador contador-pendiente">{pendientes.length} por aceptar</span>}
      </h2>
      <ul className="lista-accesos">
        {lista.map((m) => (
          <li key={m.user_id} className="acceso" data-rol={m.rol}>
            <span className="acceso-avatar" aria-hidden>{m.rol === "kiosco" ? <IconoTableta /> : m.email.slice(0, 1).toUpperCase()}</span>
            <div className="acceso-datos">
              <strong>{m.email}{m.user_id === ctx.userId && <span className="etiqueta etiqueta-origen">tú</span>}</strong>
              <span><span className="chip-rol">{ROL[m.rol]}</span>{lugar(m.rol, m.centro_trabajo_id) && <> · {lugar(m.rol, m.centro_trabajo_id)}</>}</span>
            </div>
            {puedeQuitar(m.rol, m.user_id) && (
              <form action={quitarAcceso} className="acceso-accion">
                <input type="hidden" name="user_id" value={m.user_id} />
                <button className="boton-chico boton-quitar" aria-label={`Quitar acceso a ${m.email}`}>Quitar acceso</button>
              </form>
            )}
          </li>
        ))}
        {pendientes.map((i) => (
          <li key={i.id} className="acceso acceso-pendiente" data-rol={i.rol}>
            <span className="acceso-avatar" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg>
            </span>
            <div className="acceso-datos">
              <strong>{i.email}</strong>
              <span>
                <span className="chip-rol">{ROL[i.rol]}</span>{lugar(i.rol, i.centro_trabajo_id) && <> · {lugar(i.rol, i.centro_trabajo_id)}</>}
                {" · "}invitación pendiente desde {fechaHora(i.creado_en, ctx.empresa.zonaHoraria)}
              </span>
            </div>
            <form action={cancelarInvitacion} className="acceso-accion">
              <input type="hidden" name="id" value={i.id} />
              <button className="boton-chico" aria-label={`Cancelar la invitación de ${i.email}`}>Cancelar</button>
            </form>
          </li>
        ))}
      </ul>

      <section className="preparar-kiosco" aria-labelledby="preparar-kiosco">
        <div className="preparar-kiosco-pasos">
          <h2 id="preparar-kiosco">Preparar una tableta como kiosco</h2>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Invita un correo de la empresa con el rol Kiosco.</strong>
                <p>Por ejemplo, kiosco.matriz@tuempresa.mx. Ahí llegará el código para entrar.</p>
                <InvitarAcceso {...opciones} rolInicial="kiosco" etiqueta="Invitar un kiosco" secundario />
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>En la tableta, escanea el código o abre la dirección.</strong>
                <p><code>{kiosco.corta}</code></p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Entra con ese correo y el código que le llegue.</strong>
                <p>La tableta queda lista: el personal checa con su número de empleado y su PIN.</p>
              </div>
            </li>
          </ol>
        </div>
        <figure className="preparar-kiosco-qr">
          <img src={qr} width={168} height={168} alt={`Código QR para abrir ${kiosco.corta} en la tableta`} />
          <figcaption>Escanéalo con la cámara de la tableta</figcaption>
        </figure>
      </section>

      <details className="desplegable roles-acceso">
        <summary>¿Qué puede hacer cada rol?</summary>
        <dl>
          <div><dt>Propietario</dt><dd>Todo, incluido invitar o quitar administradores.</dd></div>
          <div><dt>Administrador</dt><dd>Todo excepto administrar a otros administradores: personal, PIN, acuerdos, centros, accesos, correcciones y exportaciones.</dd></div>
          <div><dt>Supervisor</dt><dd>Consulta el tablero y los registros, corrige checadas con motivo, atiende objeciones y exporta. No da de alta ni de baja, ni firma acuerdos.</dd></div>
          <div><dt>Kiosco</dt><dd>Una tableta en el centro de trabajo donde el personal checa con número y PIN. No ve el panel.</dd></div>
        </dl>
      </details>
    </>
  );
}

function IconoTableta() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M11 18h2" />
    </svg>
  );
}
