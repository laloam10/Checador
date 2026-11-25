import Link from "next/link";
import { redirect } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormConformidad } from "@/components/FormConformidad";
import { TablaSemana } from "@/components/TablaSemana";
import { Navegacion } from "@/components/Navegacion";
import { UbicacionChecada } from "@/components/UbicacionChecada";
import { SinVinculo } from "@/components/SinVinculo";
import { lunesDe, misTrabajadores, semanaDeTrabajador, sumarDias } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";
import { llaveMapa, ubicacionesDe } from "@/lib/ubicacionesDatos";

const ETIQUETA: Record<string, string> = { entrada: "Entrada", salida: "Salida", inicio_pausa: "Inicio de pausa", fin_pausa: "Fin de pausa" };
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];


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

  const [{ semana, reconstruccion, filas }, { data: conformidad }] = await Promise.all([
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

  // Su propia ubicación al checar (si su centro la registra): es su dato y debe poder verlo.
  const checadas = filas.filter((f) => ETIQUETA[f.tipo] && aHoraLocal(f.hora_efectiva, trabajador.zonaHoraria).slice(0, 10) >= lunes
    && aHoraLocal(f.hora_efectiva, trabajador.zonaHoraria).slice(0, 10) <= domingo);
  const ubicaciones = await ubicacionesDe(supabase, checadas.map((f) => f.id));
  const conUbicacion = checadas.filter((f) => ubicaciones.has(f.id)).sort((a, b) => Date.parse(a.hora_efectiva) - Date.parse(b.hora_efectiva));
  const mapa = llaveMapa();

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

        <TablaSemana lunes={lunes} semana={semana} reconstruccion={reconstruccion} />

        {conUbicacion.length > 0 && (
          <>
            <h2>Ubicación de tus checadas</h2>
            <p className="ayuda">
              Tu empresa registra la ubicación de tu teléfono o del kiosco solo al momento de checar, para ver si fue en tu
              centro de trabajo. No cambia tus horas. Se borra a los 90 días.
            </p>
            <ul className="bitacora ubicaciones-propias">
              {conUbicacion.map((f) => {
                const local = aHoraLocal(f.hora_efectiva, trabajador.zonaHoraria);
                return (
                  <li key={f.id}>
                    <div className="bitacora-fila">
                      <span className="bitacora-hora">{DIAS[new Date(`${local.slice(0, 10)}T12:00:00Z`).getUTCDay()]} {local.slice(11)}</span>
                      <span>{ETIQUETA[f.tipo]}</span>
                      <UbicacionChecada u={ubicaciones.get(f.id)!} llaveMapa={mapa} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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
