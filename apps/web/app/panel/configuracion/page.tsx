import Link from "next/link";
import { cambiarHorarioPredeterminado, eliminarHorario, guardarEmpresa } from "@/app/panel/acciones";
import { FormHorario } from "@/components/panel/FormHorario";
import { resumenHorario } from "@/lib/horarios";
import { horariosDeEmpresa } from "@/lib/horariosDatos";
import { FormAccion } from "@/components/panel/FormAccion";
import { InterruptorRecordatorios } from "@/components/panel/InterruptorRecordatorios";
import { SeccionSuscripcion, type DatosSuscripcion } from "@/components/panel/SeccionSuscripcion";
import { configCobro } from "@/lib/cobro";
import { NuevoHorario } from "@/components/panel/NuevoHorario";
import { esGestor, requierePanel, ZONAS_MX } from "@/lib/panel";

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const { pago } = await searchParams;
  const ctx = await requierePanel();
  const gestor = esGestor(ctx.rol);
  const { data: empresa } = await ctx.supabase
    .from("empresas")
    .select("razon_social, rfc, zona_horaria, recordatorios_conformidad, aviso_privacidad_url")
    .eq("id", ctx.empresa.id)
    .single();
  const recordatorios = empresa?.recordatorios_conformidad ?? true;
  const [{ horarios, predeterminado }, { data: personal }, { data: suscripcion }] = await Promise.all([
    horariosDeEmpresa(ctx.supabase, ctx.empresa.id),
    ctx.supabase.from("trabajadores").select("horario_id, sin_horario_fijo").eq("empresa_id", ctx.empresa.id).is("fecha_baja", null),
    // Solo propietarios y administradores la ven (RLS).
    ctx.supabase.from("suscripciones").select("estado, prueba_hasta, periodo_fin, pago_vencido_desde, ciclo, suscripcion_externa").eq("empresa_id", ctx.empresa.id).maybeSingle<DatosSuscripcion>(),
  ]);
  // Cuántas personas activas usa cada horario (las que no tienen uno propio usan el de la empresa).
  const usan = (id: string) =>
    (personal ?? []).filter((t) => !t.sin_horario_fijo && (t.horario_id ?? predeterminado) === id).length;
  const zona = ZONAS_MX.find((z) => z.zona === empresa?.zona_horaria)?.etiqueta ?? empresa?.zona_horaria;

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Configuración</h1>
        <nav className="indice-secciones" aria-label="Secciones de Configuración">
          <a href="#empresa">Empresa</a>
          <a href="#horarios">Horarios</a>
          <a href="#recordatorios">Recordatorios</a>
          {suscripcion && <a href="#suscripcion">Suscripción</a>}
        </nav>
      </div>
      {!gestor && (
        <p className="mensaje mensaje-aviso">Solo el propietario o un administrador pueden cambiar la configuración.</p>
      )}

      <h2 id="empresa">Empresa</h2>
      <div className="form-panel panel-grupos">
        <section className="grupo-campos">
          <div className="grupo-titulo">
            <h3>Datos de la empresa</h3>
            <p>
              Aparecen en el acuerdo de registro de cada persona. La zona horaria se usa en el tablero; cada centro tiene la
              suya en <Link href="/panel/centros">Centros</Link>, y esa es la que cuenta para las checadas.
            </p>
          </div>
          <div className="grupo-cuerpo">
            {gestor ? (
              <FormAccion accion={guardarEmpresa} boton="Guardar datos" className="form-plano">
                <div className="campos campos-2">
                  <label className="campo-2">
                    Razón social o nombre del negocio
                    <input name="razon_social" required defaultValue={empresa?.razon_social ?? ""} />
                  </label>
                  <label>
                    <span className="etiqueta-campo">RFC<span className="opcional"> (opcional)</span></span>
                    <input name="rfc" maxLength={13} autoCapitalize="characters" defaultValue={empresa?.rfc ?? ""} />
                  </label>
                  <label>
                    Zona horaria de la empresa
                    <select name="zona_horaria" defaultValue={empresa?.zona_horaria ?? "America/Mexico_City"}>
                      {ZONAS_MX.map((z) => <option key={z.zona} value={z.zona}>{z.etiqueta}</option>)}
                    </select>
                  </label>
                  <label className="campo-2">
                    <span className="etiqueta-campo">Enlace a tu aviso de privacidad<span className="opcional"> (opcional)</span></span>
                    <input name="aviso_privacidad_url" type="url" inputMode="url" placeholder="https://tuempresa.mx/aviso-de-privacidad"
                      defaultValue={empresa?.aviso_privacidad_url ?? ""} />
                    <small className="ayuda">
                      Tu empresa es responsable de los datos de tu personal y debe darle su aviso de privacidad. Checador muestra
                      este enlace en la aplicación y en el kiosco.
                    </small>
                  </label>
                </div>
                <p className="mensaje mensaje-aviso">
                  <strong>Antes de cambiar la razón social o el RFC:</strong> al cambiarlos, los acuerdos de todo tu personal
                  quedan <strong>desactualizados</strong> y habrá que firmar una versión nueva (la anterior sigue vigente
                  mientras tanto). Hazlo solo si el dato estaba mal o cambió de verdad.
                </p>
              </FormAccion>
            ) : (
              <dl className="resumen">
                <dt>Razón social</dt><dd>{empresa?.razon_social}</dd>
                <dt>RFC</dt><dd>{empresa?.rfc ?? "—"}</dd>
                <dt>Aviso de privacidad</dt><dd>{empresa?.aviso_privacidad_url ? <a href={empresa.aviso_privacidad_url} target="_blank" rel="noopener">{empresa.aviso_privacidad_url}</a> : "—"}</dd>
                <dt>Zona horaria</dt><dd>{zona}</dd>
              </dl>
            )}
          </div>
        </section>
      </div>

      <h2 id="horarios">Horarios</h2>
      <div className="form-panel panel-grupos">
        <section className="grupo-campos">
          <div className="grupo-titulo">
            <h3>Horario normal de trabajo</h3>
            <p>
              Para ver quién llega tarde, sale antes o trabaja fuera de horario. Es informativo: no impide checar ni descuenta
              nada, y el tiempo extra se sigue calculando por horas trabajadas. Si una persona tiene horario, su{" "}
              <strong>jornada pactada por día</strong> sale de él.
            </p>
          </div>
          <div className="grupo-cuerpo">
            {horarios.length > 0 ? (
              <ul className="horarios">
                {horarios.map((h) => (
                  <li key={h.id}>
                    <details>
                      <summary>
                        <span className="horario-nombre">
                          <strong>{h.nombre}</strong>
                          {h.id === predeterminado && <span className="insignia-estado insignia-ok">De la empresa</span>}
                        </span>
                        <span className="horario-resumen">{resumenHorario(h.dias)}</span>
                        <span className="horario-meta">
                          Tolerancia {h.tolerancia_min} min · {usan(h.id) === 1 ? "1 persona" : `${usan(h.id)} personas`}
                        </span>
                      </summary>
                      {gestor && (
                        <div className="horario-edicion">
                          <FormHorario h={h} />
                          {usan(h.id) > 0 && (
                            <p className="mensaje mensaje-aviso">
                              Al cambiar las horas de este horario se recalcula la jornada pactada de {usan(h.id) === 1 ? "1 persona" : `${usan(h.id)} personas`};
                              si cambia, sus acuerdos de registro quedan <strong>desactualizados</strong> y habrá que firmar una versión nueva.
                            </p>
                          )}
                          <FormAccion accion={eliminarHorario} boton="Borrar horario" peligro className="form-linea">
                            <input type="hidden" name="id" value={h.id} />
                            <label>Escribe BORRAR para confirmar<input name="confirmar" autoComplete="off" /></label>
                          </FormAccion>
                        </div>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vacio">Tu empresa aún no tiene horarios.</p>
            )}
            {gestor && horarios.length > 0 && (
              <FormAccion accion={cambiarHorarioPredeterminado} boton="Guardar" className="form-linea">
                <label>
                  Horario de la empresa (para quien no tiene uno propio)
                  <select name="horario_predeterminado" defaultValue={predeterminado ?? ""}>
                    <option value="">Ninguno</option>
                    {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </label>
              </FormAccion>
            )}
            {gestor && (
              <NuevoHorario abiertoAlInicio={horarios.length === 0}>
                <FormHorario />
              </NuevoHorario>
            )}
          </div>
        </section>
      </div>

      <h2 id="recordatorios">Recordatorios</h2>
      <div className="form-panel panel-grupos">
        <section className="grupo-campos">
          <div className="grupo-titulo">
            <h3>Recordatorios de conformidad</h3>
            <p>
              Cada lunes a las 10:00 (centro de México), un correo a quien tenga semanas sin revisar o semanas que objetó y ya
              corregiste. Máximo uno por persona a la semana. Responder sigue siendo voluntario.
            </p>
          </div>
          <div className="grupo-cuerpo">
            {gestor ? (
              <InterruptorRecordatorios inicial={recordatorios} />
            ) : (
              <p>
                Los recordatorios están <strong>{recordatorios ? "activados" : "desactivados"}</strong>.
              </p>
            )}
            <p className="ayuda">
              Revisa las últimas 8 semanas. Solo lo recibe quien tiene correo; quien checa en el kiosco ve sus semanas
              pendientes ahí, al identificarse con su PIN. Este interruptor también controla el aviso «semana por revisar» en
              el teléfono. El resultado de cada envío está en <Link href="/panel/objeciones#recordatorios">Objeciones</Link>.
            </p>
          </div>
        </section>
      </div>

      {suscripcion && (
        <>
          <h2 id="suscripcion">Suscripción</h2>
          <SeccionSuscripcion
            suscripcion={suscripcion}
            personas={personal?.length ?? 0}
            zonaHoraria={ctx.empresa.zonaHoraria}
            cobroDisponible={configCobro() !== null}
            aviso={pago === "listo" || pago === "cancelado" ? pago : undefined}
          />
        </>
      )}
    </>
  );
}
