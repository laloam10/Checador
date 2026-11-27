import { redirect } from "next/navigation";
import { Marca } from "@/components/Marca";
import { FormAccion } from "@/components/panel/FormAccion";
import { crearEmpresa } from "@/app/panel/acciones";
import { legalPublicado } from "@/lib/legal";
import { membresiaPanel, ZONAS_MX } from "@/lib/panel";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Checador · Registra tu empresa" };

export default async function AltaEmpresa() {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) redirect("/entrar?siguiente=/alta-empresa");
  if (await membresiaPanel(supabase, userId)) redirect("/panel");

  return (
    <main className="alta-empresa">
      <header className="alta-cabecera">
        <Marca tamano={36} subtitulo="Registro de jornada" />
        <h1>Bienvenido a Checador</h1>
        <p>En tres pasos tu personal empieza a registrar su jornada. Serás el propietario de la cuenta.</p>
        <p className="alta-prueba">
          <strong>14 días de prueba gratis</strong> con todas las funciones, sin tarjeta. Después pagas según cuántas personas
          trabajan contigo: <a href="/guia#precios">ver precios</a>.
        </p>
        <ol className="pasos-alta" aria-label="Pasos para empezar">
          <li className="actual"><span>1</span>Tu empresa</li>
          <li><span>2</span>Tu personal</li>
          <li><span>3</span>Los acuerdos</li>
        </ol>
      </header>

      <FormAccion accion={crearEmpresa} boton="Crear empresa" className="form-panel panel-grupos form-alta">
        <section className="grupo-campos">
          <div className="grupo-titulo">
            <h3>Tu empresa</h3>
            <p>Aparece en el acuerdo de registro de cada persona y en las constancias.</p>
          </div>
          <div className="campos campos-2">
            <label className="campo-2">Razón social o nombre del negocio<input name="razon_social" required autoComplete="organization" /></label>
            <label>
              <span className="etiqueta-campo">RFC<span className="opcional"> (opcional)</span></span>
              <input name="rfc" maxLength={13} autoCapitalize="characters" style={{ textTransform: "uppercase" }} />
            </label>
            <label>
              Zona horaria
              <select name="zona_horaria" defaultValue="America/Mexico_City">
                {ZONAS_MX.map((z) => <option key={z.zona} value={z.zona}>{z.etiqueta}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section className="grupo-campos">
          <div className="grupo-titulo">
            <h3>Primer centro de trabajo</h3>
            <p>La sucursal o lugar donde trabaja tu personal. Después puedes agregar más.</p>
          </div>
          <div className="grupo-cuerpo">
            <label>Nombre de tu primer centro de trabajo<input name="centro" placeholder="Matriz" /></label>
            <fieldset className="opciones-acceso">
              <legend>¿Tu personal puede salir del lugar durante la pausa de comida?</legend>
              <label className="opcion-acceso">
                <input type="radio" name="pausa_puede_salir" value="si" required />
                <span><strong>Sí, puede salir</strong><small>El tiempo de comida no cuenta como jornada.</small></span>
              </label>
              <label className="opcion-acceso">
                <input type="radio" name="pausa_puede_salir" value="no" />
                <span><strong>No, debe quedarse en el lugar</strong><small>El tiempo de comida cuenta como jornada pagada (art. 64 LFT).</small></span>
              </label>
            </fieldset>
          </div>
        </section>
        {legalPublicado() && (
          <label className="casilla-linea alta-acepto">
            <input type="checkbox" name="acepto" required />
            <span>
              Leí y acepto los <a href="/terminos" target="_blank" rel="noopener">Términos del servicio</a> y el{" "}
              <a href="/privacidad" target="_blank" rel="noopener">Aviso de privacidad</a> de Checador, en nombre de la
              empresa.
            </span>
          </label>
        )}
      </FormAccion>
      <p className="ayuda alta-despues">
        Después podrás dar de alta a tu personal (uno por uno o desde Excel), invitar a administradores, supervisores y
        kioscos, y firmar los acuerdos de registro. Puedes cambiar estos datos cuando quieras en Configuración y Centros.
      </p>
    </main>
  );
}
