import Link from "next/link";
import { redirect } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormConformidad } from "@/components/FormConformidad";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { lunesDe, misTrabajadores, semanaDeTrabajador, sumarDias } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function hm(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export default async function Registros({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar");

  const trabajador = (await misTrabajadores(supabase, userId))[0];
  if (!trabajador) return <SinVinculo />;

  const hoy = aHoraLocal(new Date(), trabajador.zonaHoraria).slice(0, 10);
  const { semana: param } = await searchParams;
  const lunes = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? lunesDe(param) : lunesDe(hoy);
  const domingo = sumarDias(lunes, 6);
  const cerrada = domingo < hoy;

  const [{ semana, reconstruccion }, { data: conformidad }] = await Promise.all([
    semanaDeTrabajador(supabase, trabajador, lunes),
    supabase
      .from("conformidades")
      .select("respuesta, comentario, respondido_en, cadena_secuencia, cadena_hash")
      .eq("trabajador_id", trabajador.id)
      .eq("periodo_inicio", lunes)
      .order("respondido_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const turnosPorDia = new Map<string, typeof reconstruccion.turnos>();
  for (const t of reconstruccion.turnos) {
    const f = t.inicio.slice(0, 10);
    turnosPorDia.set(f, [...(turnosPorDia.get(f) ?? []), t]);
  }

  return (
    <main>
      <Navegacion />
      <section className="registros">
        <div className="semana-nav">
          <Link href={`/registros?semana=${sumarDias(lunes, -7)}`}>← Anterior</Link>
          <strong>
            {lunes} al {domingo}
          </strong>
          {lunes < lunesDe(hoy) ? <Link href={`/registros?semana=${sumarDias(lunes, 7)}`}>Siguiente →</Link> : <span />}
        </div>

        <table className="tabla">
          <thead>
            <tr>
              <th>Día</th>
              <th>Turnos</th>
              <th>Trabajado</th>
              <th>Extra</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).map((fecha) => {
              const dia = semana.dias.find((d) => d.fecha === fecha);
              const turnos = turnosPorDia.get(fecha) ?? [];
              const extra = (dia?.extraDobleMin ?? 0) + (dia?.extraTripleMin ?? 0);
              return (
                <tr key={fecha}>
                  <td>
                    {DIAS[new Date(`${fecha}T00:00:00Z`).getUTCDay()]} {fecha.slice(8)}
                  </td>
                  <td>
                    {turnos.length === 0
                      ? "—"
                      : turnos.map((t) => (
                          <div key={t.inicio}>
                            {t.inicio.slice(11)}–{t.fin.slice(11)}
                            {t.pausas?.map((p) => (
                              <small key={p.inicio}>
                                {" "}
                                pausa {p.inicio.slice(11)}–{p.fin.slice(11)}
                                {p.puedeSalir ? "" : " (cuenta como jornada)"}
                              </small>
                            ))}
                            {t.tieneDiferidos && <small className="etiqueta">sin conexión</small>}
                          </div>
                        ))}
                  </td>
                  <td>{dia ? hm(dia.trabajadoMin) : "—"}</td>
                  <td>{extra ? hm(extra) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td>{hm(semana.totales.trabajadoMin)}</td>
              <td>{hm(semana.totales.extraDobleMin + semana.totales.extraTripleMin)}</td>
            </tr>
          </tfoot>
        </table>

        <dl className="resumen">
          <dt>Jornada ordinaria</dt>
          <dd>
            {hm(semana.totales.ordinariaMin)} de {hm(semana.jornadaSemanalMaxMin)} máximo legal
          </dd>
          <dt>Extra pagada al doble</dt>
          <dd>{hm(semana.totales.extraDobleMin)}</dd>
          <dt>Extra pagada al triple</dt>
          <dd>{hm(semana.totales.extraTripleMin)}</dd>
        </dl>

        {reconstruccion.incidencias.length > 0 && (
          <div className="mensaje mensaje-aviso">
            <p>Registros incompletos (pide a tu empleador que los corrija):</p>
            <ul>
              {reconstruccion.incidencias.map((i) => (
                <li key={`${i.codigo}-${i.eventoId}`}>{i.mensaje}</li>
              ))}
            </ul>
          </div>
        )}

        {semana.alertas.length > 0 && (
          <div className="mensaje mensaje-aviso">
            <ul>
              {semana.alertas.map((a, i) => (
                <li key={i}>
                  {a.mensaje} <small>({a.fundamento})</small>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2>Tu conformidad</h2>
        {conformidad ? (
          <div className={`mensaje ${conformidad.respuesta === "conforme" ? "mensaje-ok" : "mensaje-aviso"}`}>
            <p>
              {conformidad.respuesta === "conforme" ? "Diste tu conformidad" : "Objetaste esta semana"} el{" "}
              {aHoraLocal(conformidad.respondido_en, trabajador.zonaHoraria).replace("T", " a las ")}.
            </p>
            {conformidad.comentario && <p>“{conformidad.comentario}”</p>}
            <p className="comprobante">
              Comprobante: registro n.º {conformidad.cadena_secuencia} · {String(conformidad.cadena_hash).slice(2, 18)}…
            </p>
          </div>
        ) : null}
        {cerrada && (!conformidad || conformidad.respuesta === "objeta") ? (
          <FormConformidad trabajadorId={trabajador.id} semana={lunes} />
        ) : !cerrada ? (
          <p className="vacio">Podrás revisar y dar tu conformidad cuando termine la semana.</p>
        ) : null}
      </section>
    </main>
  );
}
