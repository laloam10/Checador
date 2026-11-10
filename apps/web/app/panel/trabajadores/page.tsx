import Link from "next/link";
import { FormAccion } from "@/components/panel/FormAccion";
import { CamposTrabajador } from "@/components/panel/CamposTrabajador";
import { estadoAcuerdo, estadosAcuerdosEmpresa, type ClaveEstado } from "@/lib/acuerdosDatos";
import { esGestor, requierePanel } from "@/lib/panel";
import { generarAcuerdosPendientes, guardarTrabajador, importarTrabajadores } from "../acciones";

const ACUERDO: Record<ClaveEstado, { texto: string; clase: string }> = {
  vigente: { texto: "Vigente", clase: "insignia-ok" },
  pendiente: { texto: "Falta su firma", clase: "insignia-aviso" },
  desactualizado: { texto: "Desactualizado", clase: "insignia-error" },
  sin_acuerdo: { texto: "Sin acuerdo", clase: "insignia-error" },
};

const FILTROS = {
  "": "Todos",
  acuerdo: "Sin acuerdo vigente",
  sin_metodo: "Sin forma de checar",
  app_pendiente: "Con correo, sin entrar aún a la app",
} as const;
type Filtro = keyof typeof FILTROS;

/** Minúsculas y sin acentos, para buscar "jose" y encontrar "José". */
const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default async function Trabajadores({
  searchParams,
}: {
  searchParams: Promise<{ bajas?: string; q?: string; centro?: string; filtro?: string }>;
}) {
  const ctx = await requierePanel();
  const { bajas, q = "", centro = "", filtro: filtroParam = "" } = await searchParams;
  const filtro: Filtro = filtroParam in FILTROS ? (filtroParam as Filtro) : "";
  let consulta = ctx.supabase
    .from("trabajadores")
    .select("id, nombre, numero_empleado, email, user_id, fecha_baja, centro_trabajo_id, centros_trabajo(nombre)")
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

  const todos = trabajadores ?? [];
  const busqueda = normalizar(q.trim());
  const visibles = todos.filter((t) => {
    if (busqueda && !normalizar(`${t.nombre} ${t.numero_empleado ?? ""} ${t.email ?? ""}`).includes(busqueda)) return false;
    if (centro && t.centro_trabajo_id !== centro) return false;
    if (filtro === "acuerdo" && (t.fecha_baja || acuerdoDe.get(t.id) === "vigente")) return false;
    if (filtro === "sin_metodo" && (t.fecha_baja || t.email || (t.numero_empleado && pines.has(t.id)))) return false;
    if (filtro === "app_pendiente" && (t.fecha_baja || !t.email || t.user_id)) return false;
    return true;
  });
  const filtrando = Boolean(busqueda || centro || filtro);

  return (
    <>
      <h1>Trabajadores</h1>
      {todos.length > 0 && (
        <form className="filtros" role="search" method="get">
          <label className="filtro-busqueda">
            Buscar
            <input type="search" name="q" defaultValue={q} placeholder="Nombre, número o correo" />
          </label>
          {(centros ?? []).length > 1 && (
            <label>
              Centro
              <select name="centro" defaultValue={centro}>
                <option value="">Todos</option>
                {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label>
            Mostrar
            <select name="filtro" defaultValue={filtro}>
              {(Object.keys(FILTROS) as Filtro[]).map((f) => <option key={f} value={f}>{FILTROS[f]}</option>)}
            </select>
          </label>
          <label className="casilla-linea">
            <input type="checkbox" name="bajas" value="1" defaultChecked={Boolean(bajas)} /> Incluir bajas
          </label>
          <button className="boton">Filtrar</button>
          {(filtrando || bajas) && <Link href="/panel/trabajadores">Limpiar</Link>}
        </form>
      )}
      {todos.length > 0 && filtrando && (
        <p className="ayuda" role="status">{visibles.length} de {todos.length} {todos.length === 1 ? "persona" : "personas"}</p>
      )}
      {todos.length === 0 ? (
        <p className="vacio">Aún no hay trabajadores.</p>
      ) : visibles.length === 0 ? (
        <p className="vacio">Nadie coincide con la búsqueda.</p>
      ) : (
        <table className="tabla tabla-tarjetas">
          <thead><tr><th>N.º</th><th>Nombre</th><th>Centro</th><th>App</th><th>PIN</th><th>Acuerdo</th><th></th></tr></thead>
          <tbody>
            {visibles.map((t) => (
              <tr key={t.id} className={t.fecha_baja ? "tachado" : ""}>
                <td data-etiqueta="N.º">{t.numero_empleado ?? "—"}</td>
                <td className="celda-titulo"><Link href={`/panel/trabajadores/${t.id}`}>{t.nombre}</Link>{t.fecha_baja && ` (baja ${t.fecha_baja})`}</td>
                <td data-etiqueta="Centro">{(Array.isArray(t.centros_trabajo) ? t.centros_trabajo[0] : t.centros_trabajo)?.nombre}</td>
                <td data-etiqueta="App">{t.user_id ? "Vinculada" : t.email ? "Pendiente" : "—"}</td>
                <td data-etiqueta="PIN">{pines.has(t.id) ? "Sí" : "—"}</td>
                <td data-etiqueta="Acuerdo">
                  {acuerdoDe.get(t.id) ? (
                    <span className={`insignia-estado ${ACUERDO[acuerdoDe.get(t.id)!].clase}`}>{ACUERDO[acuerdoDe.get(t.id)!].texto}</span>
                  ) : "—"}
                </td>
                <td className="celda-accion"><Link href={`/panel/trabajadores/${t.id}/semana`}>Registros</Link></td>
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
            <>
              <FormAccion accion={guardarTrabajador} boton="Dar de alta">
                <CamposTrabajador centros={centros ?? []} />
              </FormAccion>
              <details className="alta-masiva" id="alta-masiva">
                <summary>Dar de alta a varias personas desde Excel</summary>
                <ol className="ayuda">
                  <li>
                    Descarga la <a href="/panel/trabajadores/plantilla" download>plantilla</a> y ábrela en Excel. Una persona por
                    renglón; borra los dos ejemplos.
                  </li>
                  <li>
                    Columnas: <strong>nombre</strong> y <strong>fecha_ingreso</strong> (15/03/2026) son obligatorias;
                    cada persona necesita <strong>numero_empleado</strong> (para el kiosco) o <strong>correo</strong> (para la
                    app). <strong>centro</strong> con el nombre tal como aparece en Centros (si solo tienes uno, puedes dejarlo
                    vacío). <strong>dia_descanso</strong>: uno o varios días, por ejemplo "domingo" o "sábado y domingo" (vacío = domingo). Con varios, el domingo es el descanso obligatorio si aparece; si no, el primero, y los demás quedan como descansos adicionales.
                  </li>
                  <li>Guárdala como <strong>CSV</strong> (Archivo → Guardar como → CSV) y súbela aquí.</li>
                </ol>
                <FormAccion accion={importarTrabajadores} boton="Revisar y dar de alta" limpiar>
                  <label>
                    Archivo CSV
                    <input type="file" name="archivo" accept=".csv,text/csv" required />
                  </label>
                  <p className="ayuda">
                    Se revisa todo el archivo antes de guardar: si un renglón tiene un error, no se da de alta a nadie y te
                    decimos qué corregir. Máximo 500 personas por archivo.
                  </p>
                </FormAccion>
              </details>
            </>
          )}
        </>
      )}
    </>
  );
}
