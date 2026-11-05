import Link from "next/link";
import { aHoraLocal } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { PrimerosPasos } from "@/components/panel/PrimerosPasos";
import { estadosAcuerdosEmpresa } from "@/lib/acuerdosDatos";
import { objecionesPendientes, presentesAhora, requierePanel } from "@/lib/panel";
import { verificarIntegridad } from "./acciones";

export default async function Tablero() {
  const ctx = await requierePanel();
  const hoy = aHoraLocal(new Date(), ctx.empresa.zonaHoraria).slice(0, 10);
  const [presentes, objeciones, estados] = await Promise.all([
    presentesAhora(ctx),
    objecionesPendientes(ctx),
    estadosAcuerdosEmpresa(ctx.supabase, ctx.empresa.id),
  ]);
  const activos = estados.length;
  const vigentes = estados.filter((e) => e.clave === "vigente").length;

  return (
    <>
      <div className="tarjetas">
        <div className="tarjeta-dato"><strong>{presentes.length}</strong>trabajando ahora</div>
        <div className="tarjeta-dato"><strong>{activos}</strong>trabajadores activos</div>
        <div className={`tarjeta-dato ${activos && vigentes < activos ? "tarjeta-alerta" : ""}`}>
          <strong>{vigentes} de {activos}</strong>
          <Link href="/panel/trabajadores#acuerdos">con acuerdo de registro vigente</Link>
        </div>
        <div className="tarjeta-dato">
          <strong>{objeciones.length}</strong>
          {objeciones.length ? <Link href="/panel/objeciones">objeciones por atender</Link> : "objeciones por atender"}
        </div>
      </div>

      <PrimerosPasos ctx={ctx} estados={estados} />

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
