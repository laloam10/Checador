import Link from "next/link";
import { FormAccion } from "@/components/panel/FormAccion";
import { CamposTrabajador } from "@/components/panel/CamposTrabajador";
import { estadoAcuerdo, estadosAcuerdosEmpresa, type ClaveEstado } from "@/lib/acuerdosDatos";
import { esGestor, requierePanel } from "@/lib/panel";
import { generarAcuerdosPendientes, guardarTrabajador } from "../acciones";

const ACUERDO: Record<ClaveEstado, { texto: string; clase: string }> = {
  vigente: { texto: "Vigente", clase: "insignia-ok" },
  pendiente: { texto: "Falta su firma", clase: "insignia-aviso" },
  desactualizado: { texto: "Desactualizado", clase: "insignia-error" },
  sin_acuerdo: { texto: "Sin acuerdo", clase: "insignia-error" },
};

export default async function Trabajadores({ searchParams }: { searchParams: Promise<{ bajas?: string }> }) {
  const ctx = await requierePanel();
  const { bajas } = await searchParams;
  let consulta = ctx.supabase
    .from("trabajadores")
    .select("id, nombre, numero_empleado, email, user_id, fecha_baja, centros_trabajo(nombre)")
    .eq("empresa_id", ctx.empresa.id)
    .order("nombre");
  if (!bajas) consulta = consulta.is("fecha_baja", null);
  const [{ data: trabajadores }, { data: centros }, { data: conPin }, estados] = await Promise.all([
    consulta,
    ctx.supabase.from("centros_trabajo").select("id, nombre").eq("empresa_id", ctx.empresa.id).order("nombre"),
    ctx.supabase.rpc("trabajadores_con_pin", { p_empresa: ctx.empresa.id }),
    estadosAcuerdosEmpresa(ctx.supabase, ctx.empresa.id),
  ]);
  const pines = new Set((conPin ?? []) as string[]);
  const acuerdoDe = new Map(estados.map((e) => [e.trabajadorId, e.clave]));
  const porFirmar = estados.filter((e) => e.clave === "sin_acuerdo" || e.clave === "desactualizado");
  // Muestra del texto que se firmará (el de la primera persona pendiente), para revisarlo antes de firmar en lote.
  const muestra = esGestor(ctx.rol) && porFirmar[0] ? await estadoAcuerdo(ctx.supabase, porFirmar[0].trabajadorId) : null;

  return (
    <>
      <h1>Trabajadores</h1>
      <p>
        {bajas ? <Link href="/panel/trabajadores">Ocultar bajas</Link> : <Link href="/panel/trabajadores?bajas=1">Mostrar bajas</Link>}
      </p>
      {(trabajadores ?? []).length === 0 ? (
        <p className="vacio">Aún no hay trabajadores.</p>
      ) : (
        <table className="tabla">
          <thead><tr><th>N.º</th><th>Nombre</th><th>Centro</th><th>App</th><th>PIN</th><th>Acuerdo</th><th></th></tr></thead>
          <tbody>
            {(trabajadores ?? []).map((t) => (
              <tr key={t.id} className={t.fecha_baja ? "tachado" : ""}>
                <td>{t.numero_empleado ?? "—"}</td>
                <td><Link href={`/panel/trabajadores/${t.id}`}>{t.nombre}</Link>{t.fecha_baja && ` (baja ${t.fecha_baja})`}</td>
                <td>{(Array.isArray(t.centros_trabajo) ? t.centros_trabajo[0] : t.centros_trabajo)?.nombre}</td>
                <td>{t.user_id ? "Vinculada" : t.email ? "Pendiente" : "—"}</td>
                <td>{pines.has(t.id) ? "Sí" : "—"}</td>
                <td>
                  {acuerdoDe.get(t.id) ? (
                    <span className={`insignia-estado ${ACUERDO[acuerdoDe.get(t.id)!].clase}`}>{ACUERDO[acuerdoDe.get(t.id)!].texto}</span>
                  ) : "—"}
                </td>
                <td><Link href={`/panel/trabajadores/${t.id}/semana`}>Registros</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {esGestor(ctx.rol) && estados.length > 0 && (
        <section id="acuerdos">
          <h2>Acuerdos de registro</h2>
          {porFirmar.length === 0 ? (
            <p className="mensaje mensaje-ok">
              La empresa ya firmó el acuerdo de todo su personal.
              {estados.some((e) => e.clave === "pendiente") && " Falta que algunas personas firmen el suyo."}
            </p>
          ) : (
            <>
              <p className="mensaje mensaje-aviso">
                {porFirmar.length} persona(s) sin acuerdo o con acuerdo desactualizado. Sin acuerdo firmado, sus registros no
                hacen prueba plena, y los acuerdos <strong>no son retroactivos</strong>: fírmalos cuanto antes.
              </p>
              {muestra?.textoPropuesto && (
                <details>
                  <summary>Ver el texto (ejemplo: {porFirmar[0]!.nombre})</summary>
                  <p className="ayuda">
                    Plantilla de referencia: revísala con tu abogado laboral. Cada acuerdo se genera con los datos de su
                    persona (método de registro, jornada, descanso y pausa).
                  </p>
                  <pre className="texto-acuerdo">{muestra.textoPropuesto}</pre>
                </details>
              )}
              <FormAccion accion={generarAcuerdosPendientes} boton={`Generar y firmar ${porFirmar.length} acuerdo(s) como empresa`}>
                <label className="casilla-linea">
                  <input type="checkbox" name="confirmo" /> Revisé el texto y firmo estos acuerdos en representación de {ctx.empresa.razonSocial}
                </label>
              </FormAccion>
            </>
          )}
        </section>
      )}

      {esGestor(ctx.rol) && (
        <>
          <h2>Dar de alta</h2>
          {(centros ?? []).length === 0 ? (
            <p className="mensaje mensaje-aviso">Primero crea un <Link href="/panel/centros">centro de trabajo</Link>.</p>
          ) : (
            <FormAccion accion={guardarTrabajador} boton="Dar de alta">
              <CamposTrabajador centros={centros ?? []} />
            </FormAccion>
          )}
        </>
      )}
    </>
  );
}
