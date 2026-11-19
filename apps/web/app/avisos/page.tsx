import { redirect } from "next/navigation";
import { ActivarAvisos } from "@/components/ActivarAvisos";
import { Navegacion } from "@/components/Navegacion";
import { SinVinculo } from "@/components/SinVinculo";
import { misTrabajadores } from "@/lib/datos";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export default async function PaginaAvisos() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/avisos");
  if (!(await misTrabajadores(supabase, userId))[0]) return <SinVinculo />;

  const { data } = await supabase
    .from("preferencias_avisos")
    .select("semana, acuerdo, correccion")
    .eq("user_id", userId)
    .maybeSingle();

  return (
    <main>
      <Navegacion />
      <section className="tarjeta">
        <h1>Avisos</h1>
        <p>
          Checador puede avisarte en este teléfono cuando tengas algo pendiente: una semana por revisar, un acuerdo por firmar o
          un cambio que hizo tu empresa en tus registros.
        </p>
        <ActivarAvisos
          vapidPublica={process.env.VAPID_PUBLICA || null}
          userId={userId}
          preferenciasIniciales={{ semana: data?.semana ?? true, acuerdo: data?.acuerdo ?? true, correccion: data?.correccion ?? true }}
        />
      </section>
    </main>
  );
}
