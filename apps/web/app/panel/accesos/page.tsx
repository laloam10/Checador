import { FormAccion } from "@/components/panel/FormAccion";
import { esGestor, requierePanel } from "@/lib/panel";
import { cancelarInvitacion, invitar, quitarAcceso } from "../acciones";

const ROL: Record<string, string> = { propietario: "Propietario", admin: "Administrador", supervisor: "Supervisor", kiosco: "Kiosco" };

export default async function Accesos() {
  const ctx = await requierePanel();
  if (!esGestor(ctx.rol)) {
    return <p className="mensaje mensaje-aviso">Solo propietarios y administradores gestionan accesos.</p>;
  }
  const [{ data: miembros }, { data: invitaciones }, { data: centros }] = await Promise.all([
    ctx.supabase.rpc("miembros_de_empresa", { p_empresa: ctx.empresa.id }),
    ctx.supabase.from("invitaciones").select("id, email, rol, centro_trabajo_id, creado_en")
      .eq("empresa_id", ctx.empresa.id).is("aceptada_en", null).order("creado_en"),
    ctx.supabase.from("centros_trabajo").select("id, nombre").eq("empresa_id", ctx.empresa.id).order("nombre"),
  ]);
  const nombreCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));
  const puedeQuitar = (rol: string, userId: string) =>
    userId !== ctx.userId && rol !== "propietario" && (ctx.rol === "propietario" || rol === "supervisor" || rol === "kiosco");

  type Miembro = { user_id: string; email: string; rol: string; centro_trabajo_id: string | null };
  return (
    <>
      <h1>Accesos</h1>
      <table className="tabla tabla-tarjetas">
        <thead><tr><th>Correo</th><th>Rol</th><th>Centro</th><th></th></tr></thead>
        <tbody>
          {((miembros ?? []) as Miembro[]).map((m) => (
            <tr key={m.user_id}>
              <td className="celda-titulo">{m.email}</td>
              <td data-etiqueta="Rol">{ROL[m.rol]}</td>
              <td data-etiqueta="Centro">{m.centro_trabajo_id ? nombreCentro.get(m.centro_trabajo_id) : m.rol === "kiosco" ? "Todos" : "—"}</td>
              <td className="celda-accion">
                {puedeQuitar(m.rol, m.user_id) && (
                  <form action={quitarAcceso}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button className="boton-chico">Quitar acceso</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {(invitaciones ?? []).map((i) => (
            <tr key={i.id}>
              <td className="celda-titulo">{i.email} <span className="etiqueta">invitación pendiente</span></td>
              <td data-etiqueta="Rol">{ROL[i.rol]}</td>
              <td data-etiqueta="Centro">{i.centro_trabajo_id ? nombreCentro.get(i.centro_trabajo_id) : i.rol === "kiosco" ? "Todos" : "—"}</td>
              <td className="celda-accion">
                <form action={cancelarInvitacion}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="boton-chico">Cancelar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Invitar</h2>
      <p className="ayuda">
        La persona entra a Checador con ese correo y obtiene el acceso automáticamente. Para un <strong>kiosco</strong>,
        usa un correo de la empresa (p. ej. kiosco.matriz@tuempresa.mx) y entra con él en la tableta, en la dirección
        <code> /kiosco</code>.
      </p>
      <FormAccion accion={invitar} boton="Invitar" limpiar>
        <div className="campos">
          <label>Correo<input name="email" type="email" required /></label>
          <label>
            Rol
            <select name="rol" defaultValue="kiosco">
              <option value="kiosco">Kiosco (tableta para checar)</option>
              <option value="supervisor">Supervisor (consulta y corrige checadas)</option>
              {ctx.rol === "propietario" && <option value="admin">Administrador (todo excepto otros administradores)</option>}
            </select>
          </label>
          <label>
            Centro (solo kiosco)
            <select name="centro_trabajo_id" defaultValue="">
              <option value="">Todos los centros</option>
              {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
      </FormAccion>
    </>
  );
}
