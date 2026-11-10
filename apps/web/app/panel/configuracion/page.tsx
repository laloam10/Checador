import Link from "next/link";
import { guardarEmpresa } from "@/app/panel/acciones";
import { FormAccion } from "@/components/panel/FormAccion";
import { InterruptorRecordatorios } from "@/components/panel/InterruptorRecordatorios";
import { esGestor, requierePanel, ZONAS_MX } from "@/lib/panel";

export default async function Configuracion() {
  const ctx = await requierePanel();
  const gestor = esGestor(ctx.rol);
  const { data: empresa } = await ctx.supabase
    .from("empresas")
    .select("razon_social, rfc, zona_horaria, recordatorios_conformidad")
    .eq("id", ctx.empresa.id)
    .single();
  const recordatorios = empresa?.recordatorios_conformidad ?? true;
  const zona = ZONAS_MX.find((z) => z.zona === empresa?.zona_horaria)?.etiqueta ?? empresa?.zona_horaria;

  return (
    <>
      <h1>Configuración</h1>
      {!gestor && (
        <p className="mensaje mensaje-aviso">Solo el propietario o un administrador pueden cambiar la configuración.</p>
      )}

      <section className="ajuste-seccion">
        <h2>Recordatorios por correo</h2>
        {gestor ? (
          <InterruptorRecordatorios inicial={recordatorios} />
        ) : (
          <p>
            Los recordatorios están <strong>{recordatorios ? "activados" : "desactivados"}</strong>.
          </p>
        )}
        <p className="ayuda">
          Cada lunes a las 10:00 (hora del centro de México), Checador envía un correo a quien tenga semanas terminadas sin
          revisar, o semanas que objetó y que ya corregiste, con un enlace a cada una. Revisa las últimas 8 semanas y envía
          como máximo un correo por persona a la semana. Solo lo recibe quien tiene correo registrado; quien checa únicamente
          en el kiosco ve sus semanas pendientes ahí, al identificarse con su PIN. Responder sigue siendo voluntario y el
          correo lo dice así. El resultado de cada envío está en{" "}
          <Link href="/panel/objeciones#recordatorios">Objeciones</Link>.
        </p>
      </section>

      <section className="ajuste-seccion">
        <h2>Datos de la empresa</h2>
        {gestor ? (
          <FormAccion accion={guardarEmpresa} boton="Guardar datos">
            <div className="campos">
              <label>
                Razón social o nombre del negocio
                <input name="razon_social" required defaultValue={empresa?.razon_social ?? ""} />
              </label>
              <label>
                RFC (opcional)
                <input name="rfc" maxLength={13} defaultValue={empresa?.rfc ?? ""} />
              </label>
              <label>
                Zona horaria de la empresa
                <select name="zona_horaria" defaultValue={empresa?.zona_horaria ?? "America/Mexico_City"}>
                  {ZONAS_MX.map((z) => <option key={z.zona} value={z.zona}>{z.etiqueta}</option>)}
                </select>
              </label>
            </div>
            <p className="mensaje mensaje-aviso">
              <strong>Antes de cambiar la razón social o el RFC:</strong> aparecen en el acuerdo de registro de cada persona.
              Al cambiarlos, los acuerdos de todo tu personal quedan <strong>desactualizados</strong> y habrá que firmar una
              versión nueva (la anterior sigue vigente mientras tanto). Hazlo solo si el dato estaba mal o cambió de verdad.
            </p>
            <p className="ayuda">
              La zona horaria de la empresa se usa en el tablero; cada centro de trabajo tiene la suya en{" "}
              <Link href="/panel/centros">Centros</Link>, y esa es la que cuenta para las checadas.
            </p>
          </FormAccion>
        ) : (
          <dl className="resumen">
            <dt>Razón social</dt><dd>{empresa?.razon_social}</dd>
            <dt>RFC</dt><dd>{empresa?.rfc ?? "—"}</dd>
            <dt>Zona horaria</dt><dd>{zona}</dd>
          </dl>
        )}
      </section>
    </>
  );
}
