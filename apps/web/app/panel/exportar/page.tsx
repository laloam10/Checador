import { aHoraLocal } from "@checador/jornada";
import { FormExportar } from "@/components/panel/FormExportar";
import { VerificarArchivo } from "@/components/panel/VerificarArchivo";
import { lunesDe, sumarDias } from "@/lib/fechas";
import { requierePanel } from "@/lib/panel";

const FORMATO: Record<string, string> = { pdf: "PDF", csv_bitacora: "CSV bitácora", csv_resumen: "CSV resumen" };

export default async function Exportar({ searchParams }: { searchParams: Promise<{ trabajador?: string }> }) {
  const ctx = await requierePanel();
  const { trabajador } = await searchParams;
  const [{ data: trabajadores }, { data: exportaciones }] = await Promise.all([
    ctx.supabase.from("trabajadores").select("id, nombre, fecha_baja").eq("empresa_id", ctx.empresa.id).order("nombre"),
    ctx.supabase
      .from("exportaciones")
      .select("id, formato, desde, hasta, generado_en, hash_archivo, cadena_integra, trabajadores(nombre)")
      .eq("empresa_id", ctx.empresa.id)
      .order("generado_en", { ascending: false })
      .limit(20),
  ]);
  const hoy = aHoraLocal(new Date(), ctx.empresa.zonaHoraria).slice(0, 10);
  const lista = (trabajadores ?? []).map((t) => ({ id: t.id, nombre: t.nombre, baja: Boolean(t.fecha_baja) }));
  const inicial = lista.some((t) => t.id === trabajador) ? trabajador! : (lista[0]?.id ?? "todos");

  return (
    <>
      <h1>Exportar para inspección o juicio</h1>
      <p className="ayuda">
        Cada archivo queda registrado con su huella digital (SHA-256), quién lo emitió y el estado de la bitácora en ese
        momento. Así puedes demostrar después que un archivo entregado no fue modificado.
      </p>
      <div className="dos-columnas">
        <section>
          <h2>Generar archivo</h2>
          <FormExportar trabajadores={lista} inicial={inicial} desde={sumarDias(lunesDe(hoy), -28)} hasta={sumarDias(lunesDe(hoy), -1)} />
        </section>
        <section>
          <h2>Verificar un archivo</h2>
          <p className="ayuda">
            ¿Te entregaron o reenviaron un archivo emitido por Checador? Compruébalo aquí: si alguien cambió un solo
            dato, la huella no coincidirá. El archivo no se sube; la huella se calcula en tu navegador.
          </p>
          <VerificarArchivo />
        </section>
      </div>

      <h2>Exportaciones recientes</h2>
      {(exportaciones ?? []).length === 0 ? (
        <p className="vacio">Aún no hay exportaciones.</p>
      ) : (
        <table className="tabla tabla-tarjetas">
          <thead><tr><th>Emitida</th><th>Trabajador</th><th>Periodo</th><th>Formato</th><th>Huella</th></tr></thead>
          <tbody>
            {(exportaciones ?? []).map((x) => (
              <tr key={x.id}>
                <td data-etiqueta="Emitida">{aHoraLocal(x.generado_en, ctx.empresa.zonaHoraria).replace("T", " ")}</td>
                <td className="celda-titulo">{((Array.isArray(x.trabajadores) ? x.trabajadores[0] : x.trabajadores) as { nombre: string } | null)?.nombre ?? "Todos"}</td>
                <td data-etiqueta="Periodo">{x.desde} al {x.hasta}</td>
                <td data-etiqueta="Formato">{FORMATO[x.formato]}{x.cadena_integra ? "" : " ⚠"}</td>
                <td data-etiqueta="Huella" className="comprobante">{String(x.hash_archivo).replace(/^\\x/, "").slice(0, 16)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
