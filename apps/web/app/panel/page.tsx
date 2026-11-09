import Link from "next/link";
import { aHoraLocal, localAInstante } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { calcularAlta, PrimerosPasos } from "@/components/panel/PrimerosPasos";
import { estadosAcuerdosEmpresa } from "@/lib/acuerdosDatos";
import { lunesDe, sumarDias } from "@/lib/datos";
import { objecionesPendientes, presentesAhora, requierePanel, type ContextoPanel } from "@/lib/panel";
import { verificarIntegridad } from "./acciones";

interface SemanaPasada {
  lunes: string;
  trabajaron: number;
  conformes: number;
  objetadas: number;
}

/** Quiénes checaron la semana pasada y cuántos ya respondieron (última respuesta por persona). */
async function semanaPasada(ctx: ContextoPanel, lunes: string): Promise<SemanaPasada> {
  const zona = ctx.empresa.zonaHoraria;
  const desde = localAInstante(`${lunes}T00:00`, zona).toISOString();
  const hasta = localAInstante(`${sumarDias(lunes, 7)}T00:00`, zona).toISOString();
  const [{ data: entradas }, { data: respuestas }] = await Promise.all([
    ctx.supabase
      .from("eventos")
      .select("trabajador_id")
      .eq("empresa_id", ctx.empresa.id)
      .eq("tipo", "entrada")
      .gte("hora_efectiva", desde)
      .lt("hora_efectiva", hasta)
      .limit(5000),
    ctx.supabase
      .from("conformidades")
      .select("trabajador_id, respuesta, respondido_en")
      .eq("empresa_id", ctx.empresa.id)
      .eq("periodo_inicio", lunes)
      .order("respondido_en"),
  ]);
  const trabajaron = new Set((entradas ?? []).map((e) => e.trabajador_id as string));
  const ultima = new Map<string, string>();
  for (const r of respuestas ?? []) if (trabajaron.has(r.trabajador_id)) ultima.set(r.trabajador_id, r.respuesta);
  const valores = [...ultima.values()];
  return {
    lunes,
    trabajaron: trabajaron.size,
    conformes: valores.filter((v) => v === "conforme").length,
    objetadas: valores.filter((v) => v === "objeta").length,
  };
}

const fechaLarga = (zona: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: zona }).format(new Date());

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** "3 h 20 min" entre dos horas locales "YYYY-MM-DDTHH:mm". */
function duracion(desde: string, hasta: string): string {
  const min = Math.max(0, Math.round((Date.parse(`${hasta}:00Z`) - Date.parse(`${desde}:00Z`)) / 60000));
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

const porcentaje = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default async function Tablero() {
  const ctx = await requierePanel();
  const zona = ctx.empresa.zonaHoraria;
  const ahora = aHoraLocal(new Date(), zona);
  const hoy = ahora.slice(0, 10);
  const lunesPasado = sumarDias(lunesDe(hoy), -7);
  const [presentes, objeciones, estados, semana] = await Promise.all([
    presentesAhora(ctx),
    objecionesPendientes(ctx),
    estadosAcuerdosEmpresa(ctx.supabase, ctx.empresa.id),
    semanaPasada(ctx, lunesPasado),
  ]);
  const alta = await calcularAlta(ctx, estados);

  const activos = estados.length;
  const vigentes = estados.filter((e) => e.clave === "vigente").length;
  const trabajando = presentes.filter((p) => p.estado !== "en_pausa").length;
  const enPausa = presentes.length - trabajando;
  const sinRespuesta = semana.trabajaron - semana.conformes - semana.objetadas;

  // Lo que requiere una acción del empleador, de lo más urgente a lo menos.
  const pendientes: { urgente?: boolean; titulo: string; detalle: string; href: string; accion: string }[] = [];
  if (objeciones.length) {
    pendientes.push({
      urgente: true,
      titulo: `${objeciones.length} ${objeciones.length === 1 ? "objeción" : "objeciones"} por atender`,
      detalle: `${[...new Set(objeciones.map((o) => o.nombre))].slice(0, 3).join(", ")} ${objeciones.length === 1 ? "indicó" : "indicaron"} que sus registros no son correctos.`,
      href: "/panel/objeciones",
      accion: "Revisar",
    });
  }
  if (alta.completa && sinRespuesta > 0) {
    pendientes.push({
      titulo: `${sinRespuesta} ${sinRespuesta === 1 ? "persona no ha" : "personas no han"} revisado la semana pasada`,
      detalle: "Una semana sin respuesta no cuenta como conformidad. Recuérdales revisarla en su app.",
      href: "/panel/objeciones#recordatorios",
      accion: "Recordatorios",
    });
  }

  return (
    <>
      <div className="tablero-cabecera">
        <h1>Tablero</h1>
        <p>{fechaLarga(zona)}</p>
      </div>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador-titulo">En turno ahora</span>
          <span className="indicador-valor">
            {trabajando} <small>de {activos}</small>
          </span>
          <span className="indicador-detalle">
            {enPausa ? `y ${enPausa} en pausa` : presentes.length ? "nadie en pausa" : "nadie ha checado entrada"}
          </span>
        </div>
        <Link href={vigentes < activos ? "/panel/trabajadores?filtro=acuerdo" : "/panel/trabajadores"} className="indicador">
          <span className="indicador-titulo">Acuerdos vigentes</span>
          <span className="indicador-valor">
            {vigentes} <small>de {activos}</small>
          </span>
          <div className={`progreso ${vigentes < activos ? "progreso-aviso" : ""}`}>
            <span style={{ width: `${porcentaje(vigentes, activos)}%` }} />
          </div>
          <span className="indicador-detalle">
            {activos === 0 ? "Aún no hay personal" : vigentes < activos ? `${activos - vigentes} sin acuerdo vigente` : `${vigentes} de ${activos} con acuerdo de registro vigente`}
          </span>
        </Link>
        <div className="indicador">
          <span className="indicador-titulo">Semana pasada</span>
          <span className="indicador-valor">
            {semana.conformes} <small>de {semana.trabajaron}</small>
          </span>
          <div className="progreso">
            <span style={{ width: `${porcentaje(semana.conformes, semana.trabajaron)}%` }} />
          </div>
          <span className="indicador-detalle">
            {semana.trabajaron === 0
              ? `Nadie checó del ${fechaCorta(lunesPasado)} al ${fechaCorta(sumarDias(lunesPasado, 6))}`
              : [
                  "confirmaron",
                  semana.objetadas ? `${semana.objetadas} objetaron` : null,
                  sinRespuesta ? `${sinRespuesta} sin respuesta` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </div>
        <Link href="/panel/objeciones" className={`indicador ${objeciones.length ? "indicador-alerta" : ""}`}>
          <span className="indicador-titulo">Objeciones</span>
          <span className="indicador-valor">{objeciones.length}</span>
          <span className="indicador-detalle">{objeciones.length ? "objeciones por atender" : "ninguna por atender"}</span>
        </Link>
      </div>

      {pendientes.length > 0 && (
        <ul className="atencion" aria-label="Requiere tu atención">
          {pendientes.map((p) => (
            <li key={p.titulo} className={p.urgente ? "urgente" : ""}>
              <div>
                <strong>{p.titulo}</strong>
                <p className="ayuda">{p.detalle}</p>
              </div>
              <Link href={p.href} className="boton">{p.accion}</Link>
            </li>
          ))}
        </ul>
      )}
      <PrimerosPasos alta={alta} />
      {alta.completa && pendientes.length === 0 && (
        <p className="todo-en-orden"><span aria-hidden>✓</span> Todo en orden: no hay nada pendiente por atender.</p>
      )}

      <div className="seccion-cabecera">
        <h2>En turno ahora</h2>
        {presentes.length > 0 && <span>{presentes.length} {presentes.length === 1 ? "persona" : "personas"}</span>}
      </div>
      {presentes.length === 0 ? (
        <p className="vacio">Nadie está en turno en este momento.</p>
      ) : (
        <ul className="en-turno">
          {presentes.map((p) => (
            <li key={p.trabajadorId}>
              <span className={`punto ${p.estado === "en_pausa" ? "pausa" : ""}`} aria-hidden />
              <div>
                <Link href={`/panel/trabajadores/${p.trabajadorId}/semana`}>{p.nombre}</Link>{" "}
                <span className={`insignia-estado ${p.estado === "en_pausa" ? "insignia-aviso" : "insignia-ok"}`}>
                  {p.estado === "en_pausa" ? "En pausa" : "Trabajando"}
                </span>
              </div>
              <div className="tiempo">
                {p.desde ? (
                  <>
                    desde {p.desde.startsWith(hoy) ? p.desde.slice(11) : p.desde.replace("T", " ")}
                    <small>{duracion(p.desde, ahora)} en turno</small>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="form-panel integridad">
        <div>
          <h2>Integridad de la bitácora</h2>
          <p className="ayuda">
            Comprueba que ningún registro haya sido alterado directamente en la base de datos (cadena de hashes SHA-256).
            Hazlo antes de entregar información a una autoridad.
          </p>
        </div>
        <FormAccion accion={verificarIntegridad} boton="Verificar ahora"><></></FormAccion>
      </section>
    </>
  );
}
