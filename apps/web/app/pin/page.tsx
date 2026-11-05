import { redirect } from "next/navigation";
import { FormPin } from "@/components/FormPin";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { misTrabajadores } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export default async function PaginaPin() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/pin");
  const trabajador = (await misTrabajadores(supabase, userId))[0];
  if (!trabajador) return <SinVinculo />;

  return (
    <main>
      <Navegacion />
      <section className="tarjeta">
        <h1>Mi PIN para el kiosco</h1>
        <p>
          Con tu número de empleado y este PIN puedes checar en el kiosco de tu centro de trabajo. No lo compartas: quien
          lo conozca puede checar por ti.
        </p>
        <FormPin trabajadorId={trabajador.id} />
      </section>
    </main>
  );
}
