import { NavPanel } from "@/components/panel/NavPanel";
import { objecionesPendientes, requierePanel } from "@/lib/panel";

export const metadata = { title: "Checador · Panel" };

const ROL = { propietario: "Propietario", admin: "Administrador", supervisor: "Supervisor" } as const;

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const ctx = await requierePanel();
  const objeciones = await objecionesPendientes(ctx);
  return (
    <div className="panel">
      <header className="panel-cabecera">
        <strong>{ctx.empresa.razonSocial}</strong>
        <span>{ROL[ctx.rol]}</span>
      </header>
      <NavPanel objeciones={objeciones.length} />
      <main className="panel-contenido">{children}</main>
    </div>
  );
}
