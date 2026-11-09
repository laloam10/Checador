import { plantillaCsv } from "@/lib/importacion";
import { requierePanel } from "@/lib/panel";

/** Plantilla CSV para el alta masiva, con un ejemplo que usa el primer centro de la empresa. */
export async function GET() {
  const ctx = await requierePanel();
  const { data } = await ctx.supabase
    .from("centros_trabajo")
    .select("nombre")
    .eq("empresa_id", ctx.empresa.id)
    .order("creado_en")
    .limit(1);
  return new Response(plantillaCsv(data?.[0]?.nombre ?? "Matriz"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-trabajadores.csv"',
      "Cache-Control": "no-store",
    },
  });
}
