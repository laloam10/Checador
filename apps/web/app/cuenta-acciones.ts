"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export type EstadoRevision = { mensaje: string } | null;

/**
 * "Volver a revisar" en la pantalla de cuenta sin vínculo: busca de nuevo un alta con el correo
 * de la sesión. Solo vincula si la sesión se inició con el código del correo (migración
 * 20261110000002); si no, hay que salir y volver a entrar.
 */
export async function revisarVinculo(_: EstadoRevision): Promise<EstadoRevision> {
  const supabase = await crearClienteServidor();
  if (!(await usuarioActual(supabase))) redirect("/entrar");
  const { data } = await supabase.rpc("vincular_mi_cuenta");
  if (typeof data === "number" && data > 0) redirect("/");
  return {
    mensaje:
      "Todavía no hay un alta con este correo. Si tu empleador ya lo corrigió, sal y vuelve a entrar con el código que te llegue.",
  };
}
