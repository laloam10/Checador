import Link from "next/link";
import { redirect } from "next/navigation";
import { Checador } from "@/components/Checador";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { cargarEventos, misTrabajadores } from "@/lib/datos";
import { miKiosco } from "@/lib/kiosco";
import { membresiaPanel } from "@/lib/panel";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export default async function Inicio() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar");

  const trabajadores = await misTrabajadores(supabase, userId);
  const trabajador = trabajadores[0];
  if (!trabajador) {
    // No es trabajador: puede ser empleador o un kiosco.
    if (await membresiaPanel(supabase, userId)) redirect("/panel");
    if (await miKiosco(supabase, userId)) redirect("/kiosco");
    return <SinVinculo />;
  }

  const [esEmpleador, { data: pendiente }] = await Promise.all([
    membresiaPanel(supabase, userId).then(Boolean),
    supabase.rpc("acuerdo_pendiente", { p_trabajador: trabajador.id }).maybeSingle<{ version: number }>(),
  ]);

  // Últimas 36 h: suficiente para saber si hay un turno abierto (incluido uno nocturno).
  const ahora = new Date();
  const eventos = await cargarEventos(
    supabase,
    trabajador.id,
    new Date(ahora.getTime() - 36 * 3600_000),
    new Date(ahora.getTime() + 3600_000),
  );

  return (
    <main>
      <Navegacion panel={esEmpleador} />
      {pendiente && (
        <Link href="/acuerdo" className="mensaje mensaje-aviso aviso-acuerdo">
          Tu empleador te envió el acuerdo de registro de jornada (versión {pendiente.version}). Léelo y fírmalo aquí →
        </Link>
      )}
      <Checador
        trabajador={{
          id: trabajador.id,
          nombre: trabajador.nombre,
          empresa: trabajador.empresa,
          centro: trabajador.centro,
          zonaHoraria: trabajador.zonaHoraria,
        }}
        eventos={eventos}
      />
    </main>
  );
}
