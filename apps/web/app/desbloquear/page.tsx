import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Desbloquear } from "@/components/Desbloquear";
import { COOKIE_BLOQUEO, rutaSiguiente } from "@/lib/acceso";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Checador · Desbloquear" };

export default async function PaginaDesbloquear({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar");
  const siguiente = rutaSiguiente((await searchParams).siguiente);
  if (!(await cookies()).get(COOKIE_BLOQUEO)) redirect(siguiente);

  // El nombre se puede leer con la sesión bloqueada (no así los registros).
  const { data } = await supabase.from("trabajadores").select("nombre").eq("user_id", userId).is("fecha_baja", null).limit(1).maybeSingle();
  const nombre = (data?.nombre as string | undefined)?.split(" ")[0] ?? null;
  return <Desbloquear nombre={nombre} siguiente={siguiente} />;
}
