import { redirect } from "next/navigation";
import { Checador } from "@/components/Checador";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { cargarEventos, misTrabajadores } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export default async function Inicio() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar");

  const trabajadores = await misTrabajadores(supabase, userId);
  const trabajador = trabajadores[0];
  if (!trabajador) return <SinVinculo />;

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
      <Navegacion />
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
