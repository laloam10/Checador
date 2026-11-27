import { CabeceraPanel, NavPanel } from "@/components/panel/NavPanel";
import { AvisoCobro, type SituacionCobro } from "@/components/panel/AvisoCobro";
import { AvisoCambios, type AvisoCambio } from "@/components/panel/AvisoCambios";
import { AvisoLegal } from "@/components/panel/AvisoLegal";
import { aHoraLocal } from "@checador/jornada";
import { legalPublicado, versionesLegales } from "@/lib/legal";
import { esGestor, objecionesPendientes, requierePanel } from "@/lib/panel";

export const metadata = { title: "Checador · Panel" };

const ROL = { propietario: "Propietario", admin: "Administrador", supervisor: "Supervisor" } as const;

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const ctx = await requierePanel();
  // Términos publicados que el propietario aún no acepta (en esta versión).
  const legal = legalPublicado() && ctx.rol === "propietario" ? versionesLegales() : null;
  const gestor = esGestor(ctx.rol);
  const hoy = aHoraLocal(new Date(), ctx.empresa.zonaHoraria).slice(0, 10);
  const [objeciones, { data: situacion }, aceptados, { data: cambios }] = await Promise.all([
    objecionesPendientes(ctx),
    ctx.supabase.rpc("situacion_cobro", { p_empresa: ctx.empresa.id }),
    legal
      ? ctx.supabase.from("aceptaciones_legales").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.empresa.id)
          .eq("terminos_version", legal.terminos).eq("privacidad_version", legal.privacidad).then((r) => (r.count ?? 0) > 0)
      : Promise.resolve(true),
    // Cambios de precio o términos por entrar en vigor (para quien administra la cuenta).
    gestor
      ? ctx.supabase.from("avisos_cambios").select("id, tipo, vigente_desde, resumen, enlace").gte("vigente_desde", hoy).order("vigente_desde")
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="panel">
      {/* Banda de marca (verde Jemba) a todo lo ancho; el contenido sigue centrado. */}
      <div className="banda">
        <div className="banda-interior">
          <CabeceraPanel empresa={ctx.empresa.razonSocial} rol={ROL[ctx.rol]} />
          <NavPanel objeciones={objeciones.length} />
        </div>
      </div>
      <main className="panel-contenido">
        {legal && !aceptados && <AvisoLegal terminos={legal.terminos} privacidad={legal.privacidad} />}
        {situacion && <AvisoCobro situacion={situacion as SituacionCobro} zonaHoraria={ctx.empresa.zonaHoraria} gestor={gestor} />}
        {/* Una empresa cancelada ya no tiene un servicio que cambie. */}
        {(situacion as SituacionCobro | null)?.motivo !== "cancelada" && <AvisoCambios avisos={(cambios ?? []) as AvisoCambio[]} />}
        {children}
      </main>
    </div>
  );
}
