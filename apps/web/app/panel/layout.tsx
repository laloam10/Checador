import { CabeceraPanel, NavPanel } from "@/components/panel/NavPanel";
import { objecionesPendientes, requierePanel } from "@/lib/panel";

export const metadata = { title: "Checador · Panel" };

const ROL = { propietario: "Propietario", admin: "Administrador", supervisor: "Supervisor" } as const;

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const ctx = await requierePanel();
  const objeciones = await objecionesPendientes(ctx);
  return (
    <div className="panel">
      {/* Banda de marca (verde Jemba) a todo lo ancho; el contenido sigue centrado. */}
      <div className="banda">
        <div className="banda-interior">
          <CabeceraPanel empresa={ctx.empresa.razonSocial} rol={ROL[ctx.rol]} />
          <NavPanel objeciones={objeciones.length} />
        </div>
      </div>
      <main className="panel-contenido">{children}</main>
    </div>
  );
}
