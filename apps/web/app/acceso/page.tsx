import { redirect } from "next/navigation";
import { AccesoAlSalir } from "@/components/AccesoAlSalir";
import { FormPin } from "@/components/FormPin";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { misTrabajadores } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Checador · Acceso" };

export default async function PaginaAcceso() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/acceso");
  const trabajador = (await misTrabajadores(supabase, userId))[0];
  if (!trabajador) return <SinVinculo />;
  const { data } = await supabase.rpc("mi_acceso");
  const acceso = (data ?? {}) as { al_salir?: "codigo" | "pin"; tiene_pin?: boolean };

  return (
    <main>
      <Navegacion />
      <section className="tarjeta">
        <h1>Acceso</h1>
        <p className="ayuda">
          La primera vez en cada teléfono siempre se entra con el código que llega a tu correo. Después eliges qué pasa al
          salir.
        </p>
        <AccesoAlSalir modo={acceso.al_salir ?? "codigo"} tienePin={Boolean(acceso.tiene_pin)} />
      </section>
      <section className="tarjeta">
        <h2>Mi PIN</h2>
        <p>
          Con tu número de empleado y este PIN checas en el kiosco de tu centro de trabajo y, si lo elegiste arriba,
          vuelves a entrar en este teléfono. No lo compartas: quien lo conozca puede checar por ti.
        </p>
        <FormPin trabajadorId={trabajador.id} />
      </section>
    </main>
  );
}
