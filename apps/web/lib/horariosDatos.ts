import "server-only";

import type { HorarioFila } from "./horarios";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Horarios de la empresa y el que aplica por omisión (RLS: miembros y personas trabajadoras de la empresa). */
export async function horariosDeEmpresa(supabase: Cliente, empresaId: string): Promise<{ horarios: HorarioFila[]; predeterminado: string | null }> {
  const [{ data: horarios, error }, { data: empresa, error: e2 }] = await Promise.all([
    supabase.from("horarios").select("id, nombre, dias, tolerancia_min").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("empresas").select("horario_predeterminado").eq("id", empresaId).maybeSingle(),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  return { horarios: (horarios ?? []) as HorarioFila[], predeterminado: empresa?.horario_predeterminado ?? null };
}
