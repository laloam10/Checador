import { CabeceraPanel, NavPanel } from "@/components/panel/NavPanel";
import { AvisoCobro, type SituacionCobro } from "@/components/panel/AvisoCobro";
import { esGestor, objecionesPendientes, requierePanel } from "@/lib/panel";

export const metadata = { title: "Checador · Panel" };

const ROL = { propietario: "Propietario", admin: "Administrador", supervisor: "Supervisor" } as const;

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const ctx = await requierePanel();
  const [objeciones, { data: situacion }] = await Promise.all([
    objecionesPendientes(ctx),
    ctx.supabase.rpc("situacion_cobro", { p_empresa: ctx.empresa.id }),
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
        {situacion && <AvisoCobro situacion={situacion as SituacionCobro} zonaHoraria={ctx.empresa.zonaHoraria} gestor={esGestor(ctx.rol)} />}
        {children}
      </main>
    </div>
  );
}
