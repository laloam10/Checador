import Link from "next/link";
import { redirect } from "next/navigation";
import { Checador } from "@/components/Checador";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { aHoraLocal } from "@checador/jornada";
import { cargarEventos, misTrabajadores } from "@/lib/datos";
import { horarioEfectivo } from "@/lib/horarios";
import { horariosDeEmpresa } from "@/lib/horariosDatos";
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

  const [esEmpleador, { data: pendiente }, { horarios, predeterminado }, { data: asignado }] = await Promise.all([
    membresiaPanel(supabase, userId).then(Boolean),
    supabase.rpc("acuerdo_pendiente", { p_trabajador: trabajador.id }).maybeSingle<{ version: number }>(),
    horariosDeEmpresa(supabase, trabajador.empresaId),
    supabase.from("trabajadores").select("horario_id, sin_horario_fijo").eq("id", trabajador.id).single(),
  ]);
  // Su horario de hoy, para que sepa qué espera su empresa (transparencia; no impide checar).
  const horario = asignado ? horarioEfectivo(asignado, horarios, predeterminado) : null;
  const tramoHoy = horario?.dias[String(new Date(`${aHoraLocal(new Date(), trabajador.zonaHoraria).slice(0, 10)}T12:00:00Z`).getUTCDay())];

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
      {horario && (
        <p className="ayuda horario-trabajador">
          {tramoHoy
            ? <>Tu horario de hoy: <strong>{tramoHoy.entrada} a {tramoHoy.salida}</strong>{tramoHoy.pausa_inicio && <> · comida {tramoHoy.pausa_inicio}–{tramoHoy.pausa_fin}</>}</>
            : "Hoy no tienes turno en tu horario."}
        </p>
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
