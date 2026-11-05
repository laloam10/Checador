import Link from "next/link";
import { aHoraLocal } from "@checador/jornada";
import { objecionesPendientes, requierePanel } from "@/lib/panel";

export default async function Objeciones() {
  const ctx = await requierePanel();
  const objeciones = await objecionesPendientes(ctx);
  return (
    <>
      <h1>Objeciones por atender</h1>
      <p className="ayuda">
        Semanas en las que el trabajador indicó que sus registros no son correctos y aún no ha vuelto a confirmar. Revisa,
        corrige con motivo y pídele que confirme de nuevo desde su app.
      </p>
      {objeciones.length === 0 ? (
        <p className="vacio">No hay objeciones pendientes.</p>
      ) : (
        <table className="tabla">
          <thead><tr><th>Trabajador</th><th>Semana</th><th>Comentario</th><th>Fecha</th></tr></thead>
          <tbody>
            {objeciones.map((o) => (
              <tr key={`${o.trabajadorId}-${o.semana}`}>
                <td><Link href={`/panel/trabajadores/${o.trabajadorId}/semana?semana=${o.semana}`}>{o.nombre}</Link></td>
                <td>{o.semana}</td>
                <td>“{o.comentario}”</td>
                <td>{aHoraLocal(o.respondidoEn, ctx.empresa.zonaHoraria).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
