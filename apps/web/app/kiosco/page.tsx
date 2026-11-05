import { redirect } from "next/navigation";
import { Kiosco } from "@/components/Kiosco";
import { miKiosco } from "@/lib/kiosco";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Checador · Kiosco" };

export default async function PaginaKiosco() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/kiosco");

  const kiosco = await miKiosco(supabase, userId);
  if (!kiosco) {
    return (
      <main>
        <section className="tarjeta" style={{ marginTop: "3rem" }}>
          <h1>Este dispositivo no está configurado como kiosco</h1>
          <p>
            La cuenta con la que entraste no tiene el rol de kiosco. Pide al administrador de la empresa que la
            registre como kiosco y vuelve a cargar esta página.
          </p>
        </section>
      </main>
    );
  }

  return <Kiosco empresa={kiosco.empresa} centro={kiosco.centro} zonaHoraria={kiosco.zonaHoraria} />;
}
