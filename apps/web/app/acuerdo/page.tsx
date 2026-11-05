import { redirect } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormFirmaAcuerdo } from "@/components/FormFirmaAcuerdo";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { folio } from "@/lib/acuerdo";
import { acuerdosDe, firmaDe, MODALIDAD } from "@/lib/acuerdosDatos";
import { misTrabajadores } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export default async function MiAcuerdo() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/acuerdo");
  const trabajador = (await misTrabajadores(supabase, userId))[0];
  if (!trabajador) return <SinVinculo />;

  const lista = await acuerdosDe(supabase, trabajador.id);
  const vigente = lista.find((a) => firmaDe(a, "empleador") && firmaDe(a, "trabajador")) ?? null;
  const pendiente = lista.find((a) => firmaDe(a, "empleador") && !firmaDe(a, "trabajador") && a.version > (vigente?.version ?? 0)) ?? null;
  const mostrar = pendiente ?? vigente;
  const zona = trabajador.zonaHoraria;

  return (
    <main>
      <Navegacion />
      <h1>Acuerdo de registro de jornada</h1>
      {!mostrar && <p className="vacio">Tu empleador aún no te ha enviado un acuerdo para firmar.</p>}
      {pendiente && (
        <p className="mensaje mensaje-aviso">
          Tu empleador firmó la versión {pendiente.version} y espera tu firma. Léela con calma antes de firmar.
        </p>
      )}
      {!pendiente && vigente && (
        <div className="mensaje mensaje-ok">
          <p>Acuerdo vigente: versión {vigente.version} · folio {folio(vigente.contenido_hash)}</p>
          <p className="ayuda">
            Tu firma: {MODALIDAD[firmaDe(vigente, "trabajador")!.modalidad]},{" "}
            {aHoraLocal(firmaDe(vigente, "trabajador")!.firmado_en, zona).replace("T", " ")}
          </p>
        </div>
      )}
      {mostrar && <pre className="texto-acuerdo">{mostrar.contenido}</pre>}
      {pendiente && <FormFirmaAcuerdo acuerdoId={pendiente.id} folio={folio(pendiente.contenido_hash)} />}
    </main>
  );
}
