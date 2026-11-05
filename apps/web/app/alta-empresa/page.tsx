import { redirect } from "next/navigation";
import { FormAccion } from "@/components/panel/FormAccion";
import { crearEmpresa } from "@/app/panel/acciones";
import { membresiaPanel, ZONAS_MX } from "@/lib/panel";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Checador · Registra tu empresa" };

export default async function AltaEmpresa() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/alta-empresa");
  if (await membresiaPanel(supabase, userId)) redirect("/panel");

  return (
    <main>
      <h1>Registra tu empresa</h1>
      <p className="ayuda">
        Serás el propietario de la cuenta. Después podrás dar de alta a tu personal e invitar a administradores,
        supervisores y kioscos.
      </p>
      <FormAccion accion={crearEmpresa} boton="Crear empresa">
        <label>Razón social o nombre del negocio<input name="razon_social" required /></label>
        <label>RFC (opcional)<input name="rfc" maxLength={13} style={{ textTransform: "uppercase" }} /></label>
        <label>Nombre de tu primer centro de trabajo<input name="centro" placeholder="Matriz" /></label>
        <label>
          Zona horaria
          <select name="zona_horaria" defaultValue="America/Mexico_City">
            {ZONAS_MX.map((z) => <option key={z.zona} value={z.zona}>{z.etiqueta}</option>)}
          </select>
        </label>
      </FormAccion>
    </main>
  );
}
