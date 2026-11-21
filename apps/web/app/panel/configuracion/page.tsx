import Link from "next/link";
import { cambiarHorarioPredeterminado, eliminarHorario, guardarEmpresa } from "@/app/panel/acciones";
import { FormHorario } from "@/components/panel/FormHorario";
import { resumenHorario } from "@/lib/horarios";
import { horariosDeEmpresa } from "@/lib/horariosDatos";
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
  const [{ horarios, predeterminado }, { data: personal }] = await Promise.all([
    horariosDeEmpresa(ctx.supabase, ctx.empresa.id),
    ctx.supabase.from("trabajadores").select("horario_id, sin_horario_fijo").eq("empresa_id", ctx.empresa.id).is("fecha_baja", null),
  ]);
  // Cuántas personas activas usa cada horario (las que no tienen uno propio usan el de la empresa).
  const usan = (id: string) =>
    (personal ?? []).filter((t) => !t.sin_horario_fijo && (t.horario_id ?? predeterminado) === id).length;
  const zona = ZONAS_MX.find((z) => z.zona === empresa?.zona_horaria)?.etiqueta ?? empresa?.zona_horaria;

  return (
    <>
      <h1>Configuración</h1>
      {!gestor && (
        <p className="mensaje mensaje-aviso">Solo el propietario o un administrador pueden cambiar la configuración.</p>
      )}

      <section className="ajuste-seccion">
        <h2>Recordatorios de conformidad</h2>
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
          <Link href="/panel/objeciones#recordatorios">Objeciones</Link>. Este interruptor también controla el aviso en el
          teléfono de «semana por revisar», para quien activó los avisos en su app.
        </p>
      </section>

      <section className="ajuste-seccion" id="horarios">
        <h2>Horarios</h2>
        <p className="ayuda">
          Define el horario normal de trabajo para ver quién llega tarde, sale antes o trabaja fuera de horario. Es
          informativo: no impide checar ni descuenta nada, y el tiempo extra se sigue calculando por horas trabajadas, no por
          la hora del reloj. Si una persona tiene horario, su <strong>jornada pactada por día</strong> sale de él (sin la
          comida, si en su centro de trabajo se puede salir a comer).
        </p>
        {horarios.length > 0 && (
          <ul className="horarios">
            {horarios.map((h) => (
              <li key={h.id}>
                <details>
                  <summary>
                    <strong>{h.nombre}</strong>
                    {h.id === predeterminado && <span className="insignia-estado insignia-ok">De la empresa</span>}{" "}
                    <span className="ayuda">
                      {resumenHorario(h.dias)} · tolerancia {h.tolerancia_min} min · {usan(h.id) === 1 ? "1 persona" : `${usan(h.id)} personas`}
                    </span>
                  </summary>
                  {gestor && (
                    <>
                      <FormHorario h={h} />
                      {usan(h.id) > 0 && (
                        <p className="mensaje mensaje-aviso">
                          Al cambiar las horas de este horario se recalcula la jornada pactada de {usan(h.id) === 1 ? "1 persona" : `${usan(h.id)} personas`};
                          si cambia, sus acuerdos de registro quedan <strong>desactualizados</strong> y habrá que firmar una versión nueva.
                        </p>
                      )}
                      <FormAccion accion={eliminarHorario} boton="Borrar horario" peligro className="form-panel form-linea">
                        <input type="hidden" name="id" value={h.id} />
                        <label>Escribe BORRAR para confirmar<input name="confirmar" autoComplete="off" /></label>
                      </FormAccion>
                    </>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
        {gestor && horarios.length > 0 && (
          <FormAccion accion={cambiarHorarioPredeterminado} boton="Guardar" className="form-panel form-linea">
            <label>
              Horario de la empresa (para quien no tiene uno propio)
              <select name="horario_predeterminado" defaultValue={predeterminado ?? ""}>
                <option value="">Ninguno</option>
                {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
              </select>
            </label>
          </FormAccion>
        )}
        {/* Siempre visible (no dentro de un <details>): así el aviso de "creado" no se oculta al recargar la sección. */}
        {gestor && (
          <div className="nuevo-horario">
            <h3>Nuevo horario</h3>
            <FormHorario />
          </div>
        )}
        {!gestor && horarios.length === 0 && <p className="vacio">Tu empresa aún no tiene horarios.</p>}
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
