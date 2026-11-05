import Link from "next/link";
import { aHoraLocal } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { objecionesPendientes, presentesAhora, requierePanel } from "@/lib/panel";
import { verificarIntegridad } from "./acciones";

export default async function Tablero() {
  const ctx = await requierePanel();
  const hoy = aHoraLocal(new Date(), ctx.empresa.zonaHoraria).slice(0, 10);
  const [presentes, objeciones, { count: activos }] = await Promise.all([
    presentesAhora(ctx),
    objecionesPendientes(ctx),
    ctx.supabase.from("trabajadores").select("id", { count: "exact", head: true })
      .eq("empresa_id", ctx.empresa.id).is("fecha_baja", null),
  ]);

  return (
    <>
      <div className="tarjetas">
        <div className="tarjeta-dato"><strong>{presentes.length}</strong>trabajando ahora</div>
        <div className="tarjeta-dato"><strong>{activos ?? 0}</strong>trabajadores activos</div>
        <div className="tarjeta-dato">
          <strong>{objeciones.length}</strong>
          {objeciones.length ? <Link href="/panel/objeciones">objeciones por atender</Link> : "objeciones por atender"}
        </div>
      </div>

      {(activos ?? 0) === 0 && (
        <p className="mensaje mensaje-aviso">
          Empieza dando de alta a tus trabajadores en <Link href="/panel/trabajadores">Trabajadores</Link>.
        </p>
      )}

      <h2>En turno ahora</h2>
      {presentes.length === 0 ? (
        <p className="vacio">Nadie está en turno en este momento.</p>
      ) : (
        <table className="tabla">
          <thead><tr><th>Trabajador</th><th>Estado</th><th>Desde</th></tr></thead>
          <tbody>
            {presentes.map((p) => (
              <tr key={p.trabajadorId}>
                <td><Link href={`/panel/trabajadores/${p.trabajadorId}/semana`}>{p.nombre}</Link></td>
                <td>{p.estado === "en_pausa" ? "En pausa" : "Trabajando"}</td>
                <td>{p.desde ? (p.desde.startsWith(hoy) ? p.desde.slice(11) : p.desde.replace("T", " ")) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Integridad de la bitácora</h2>
      <p className="ayuda">
        Comprueba que ningún registro haya sido alterado directamente en la base de datos (cadena de hashes SHA-256).
      </p>
      <FormAccion accion={verificarIntegridad} boton="Verificar ahora"><></></FormAccion>
    </>
  );
}
