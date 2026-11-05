import Link from "next/link";
import { redirect } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormConformidad } from "@/components/FormConformidad";
import { TablaSemana } from "@/components/TablaSemana";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { lunesDe, misTrabajadores, semanaDeTrabajador, sumarDias } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";


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
