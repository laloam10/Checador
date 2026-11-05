import Link from "next/link";
import { FormAccion } from "@/components/panel/FormAccion";
import { CamposTrabajador } from "@/components/panel/CamposTrabajador";
import { esGestor, requierePanel } from "@/lib/panel";
import { guardarTrabajador } from "../acciones";

export default async function Trabajadores({ searchParams }: { searchParams: Promise<{ bajas?: string }> }) {
  const ctx = await requierePanel();
  const { bajas } = await searchParams;
  let consulta = ctx.supabase
    .from("trabajadores")
    .select("id, nombre, numero_empleado, email, user_id, fecha_baja, centros_trabajo(nombre)")
    .eq("empresa_id", ctx.empresa.id)
    .order("nombre");
  if (!bajas) consulta = consulta.is("fecha_baja", null);
  const [{ data: trabajadores }, { data: centros }, { data: conPin }] = await Promise.all([
    consulta,
    ctx.supabase.from("centros_trabajo").select("id, nombre").eq("empresa_id", ctx.empresa.id).order("nombre"),
    ctx.supabase.rpc("trabajadores_con_pin", { p_empresa: ctx.empresa.id }),
  ]);
  const pines = new Set((conPin ?? []) as string[]);

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
          <thead><tr><th>N.º</th><th>Nombre</th><th>Centro</th><th>App</th><th>PIN</th><th></th></tr></thead>
          <tbody>
            {(trabajadores ?? []).map((t) => (
              <tr key={t.id} className={t.fecha_baja ? "tachado" : ""}>
                <td>{t.numero_empleado ?? "—"}</td>
                <td><Link href={`/panel/trabajadores/${t.id}`}>{t.nombre}</Link>{t.fecha_baja && ` (baja ${t.fecha_baja})`}</td>
                <td>{(Array.isArray(t.centros_trabajo) ? t.centros_trabajo[0] : t.centros_trabajo)?.nombre}</td>
                <td>{t.user_id ? "Vinculada" : t.email ? "Pendiente" : "—"}</td>
                <td>{pines.has(t.id) ? "Sí" : "—"}</td>
                <td><Link href={`/panel/trabajadores/${t.id}/semana`}>Registros</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
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
