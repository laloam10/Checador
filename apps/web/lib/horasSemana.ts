import "server-only";

import { semanaDeTrabajador, trabajadoresActivos } from "./datos";
import type { ContextoPanel } from "./panel";

export interface HorasPersona {
  id: string;
  nombre: string;
  ordinariaMin: number;
  dobleMin: number;
  tripleMin: number;
  totalMin: number;
}

export interface HorasSemana {
  personas: HorasPersona[]; // con horas, de más a menos
  sinHoras: number;
  maximoMin: number; // jornada semanal máxima vigente (art. 61 y transitorios)
}

/**
 * Horas de la semana por persona, con el mismo cálculo que la semana de cada quien (y que
 * Mis registros): ordinaria, extra al doble y al triple (arts. 66 a 68 LFT). Se consulta en
 * grupos de diez personas para no saturar la base.
 */
export async function horasDeLaSemana(ctx: ContextoPanel, lunes: string): Promise<HorasSemana> {
  const personal = await trabajadoresActivos(ctx.supabase, ctx.empresa.id);
  const personas: HorasPersona[] = [];
  let maximoMin = 0;
  for (let i = 0; i < personal.length; i += 10) {
    const grupo = await Promise.all(personal.slice(i, i + 10).map((t) => semanaDeTrabajador(ctx.supabase, t, lunes)));
    grupo.forEach(({ semana }, j) => {
      const t = semana.totales;
      maximoMin = Math.max(maximoMin, semana.jornadaSemanalMaxMin);
      personas.push({
        id: personal[i + j]!.id,
        nombre: personal[i + j]!.nombre,
        ordinariaMin: t.ordinariaMin,
        dobleMin: t.extraDobleMin,
        tripleMin: t.extraTripleMin,
        totalMin: t.trabajadoMin,
      });
    });
  }
  const conHoras = personas.filter((p) => p.totalMin > 0).sort((a, b) => b.totalMin - a.totalMin || a.nombre.localeCompare(b.nombre));
  return { personas: conHoras, sinHoras: personas.length - conHoras.length, maximoMin: maximoMin || 48 * 60 };
}
