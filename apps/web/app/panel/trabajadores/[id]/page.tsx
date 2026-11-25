import Link from "next/link";
import { notFound } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { CamposTrabajador } from "@/components/panel/CamposTrabajador";
import { CabeceraTrabajador, type ResumenAcuerdo } from "@/components/panel/CabeceraTrabajador";
import { SeccionAcuerdo } from "@/components/panel/SeccionAcuerdo";
import { estadoAcuerdo } from "@/lib/acuerdosDatos";
import { fecha, fechaHora } from "@/lib/formato";
import { horariosDeEmpresa } from "@/lib/horariosDatos";
import { esGestor, requierePanel } from "@/lib/panel";
import { asignarPin, darDeBaja, generarCodigoWhatsApp, guardarTrabajador, revertirBaja } from "../../acciones";

export default async function FichaTrabajador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requierePanel();
  const [{ data: t }, { data: centros }, { data: conPin }, { data: historial }, { horarios, predeterminado }] = await Promise.all([
    ctx.supabase
      .from("trabajadores")
      .select("id, nombre, numero_empleado, email, telefono, telefono_verificado_en, curp, user_id, horario_id, sin_horario_fijo, centro_trabajo_id, fecha_ingreso, fecha_baja, dia_descanso, dias_descanso_adicionales, jornada_pactada_min")
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id)
      .maybeSingle(),
    ctx.supabase.from("centros_trabajo").select("id, nombre").eq("empresa_id", ctx.empresa.id).order("nombre"),
    ctx.supabase.rpc("trabajadores_con_pin", { p_empresa: ctx.empresa.id }),
    ctx.supabase
      .from("historial_bajas")
      .select("id, accion, fecha_baja, motivo, creado_en")
      .eq("trabajador_id", id)
      .order("id"),
    horariosDeEmpresa(ctx.supabase, ctx.empresa.id),
  ]);
  if (!t) notFound();
  const gestor = esGestor(ctx.rol);
  const tienePin = ((conPin ?? []) as string[]).includes(t.id);

  // Estado del acuerdo: una sola consulta para la cabecera y la sección.
  const acuerdo = t.fecha_baja ? null : await estadoAcuerdo(ctx.supabase, t.id);
  const resumen: ResumenAcuerdo | null = acuerdo && {
    clave: !acuerdo.vigente && !acuerdo.pendiente ? "sin_acuerdo" : acuerdo.desactualizado ? "desactualizado" : acuerdo.pendiente ? "pendiente" : "vigente",
    version: (acuerdo.pendiente ?? acuerdo.vigente)?.version ?? null,
  };
  const horarioId = t.horario_id ?? predeterminado;
  const horario = t.sin_horario_fijo
    ? "Sin horario fijo"
    : horarios.find((h) => h.id === horarioId)?.nombre ? `Horario ${horarios.find((h) => h.id === horarioId)!.nombre}` : "Sin horario";

  return (
    <>
      <p className="migas"><Link href="/panel/trabajadores">← Trabajadores</Link></p>
      <CabeceraTrabajador
        t={t}
        centro={(centros ?? []).find((c) => c.id === t.centro_trabajo_id)?.nombre ?? ""}
        horario={horario}
        tienePin={tienePin}
        acuerdo={resumen}
      />

      {t.fecha_baja && (
        <p className="mensaje mensaje-aviso">
          Dado de baja el {fecha(t.fecha_baja)}. Ya no puede checar; sus registros se conservan como exige el art. 804 de la LFT.
        </p>
      )}

      {gestor && t.fecha_baja && (
        <section>
          <h2>¿La baja fue un error?</h2>
          <p className="ayuda">
            Al deshacerla, la persona vuelve a estar activa y puede checar de nuevo. Queda registrado quién la deshizo, cuándo y
            por qué. Si la fecha era la equivocada, deshazla y registra la baja otra vez con la fecha correcta.
          </p>
          <FormAccion accion={revertirBaja} boton="Deshacer la baja">
            <input type="hidden" name="trabajador_id" value={t.id} />
            <label>
              Motivo
              <textarea name="motivo" rows={2} required minLength={5} maxLength={1000}
                placeholder="Por ejemplo: se capturó la baja de la persona equivocada." />
            </label>
          </FormAccion>
        </section>
      )}

      {(historial ?? []).length > 0 && (
        <section>
          <h2>Historial de bajas</h2>
          <ul className="bitacora">
            {(historial ?? []).map((h) => (
              <li key={h.id}>
                <strong>{h.accion === "baja" ? `Baja con fecha ${fecha(h.fecha_baja)}` : `Baja del ${fecha(h.fecha_baja)} deshecha`}</strong>
                <span className="ayuda"> · registrado el {fechaHora(h.creado_en, ctx.empresa.zonaHoraria, true)}</span>
                {h.motivo && <span className="ajuste">Motivo: {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {acuerdo && <SeccionAcuerdo ctx={ctx} trabajadorId={t.id} gestor={gestor} e={acuerdo} />}

      {gestor && !t.fecha_baja && (
        <>
          <h2 id="datos">Datos</h2>
          <FormAccion accion={guardarTrabajador} boton="Guardar cambios">
            <CamposTrabajador centros={centros ?? []} horarios={horarios} predeterminado={predeterminado} t={{ ...t, jornada_pactada_min: t.jornada_pactada_min as Record<string, number> | null }} />
          </FormAccion>

          <h2 id="kiosco">Kiosco y WhatsApp</h2>
          <div className="form-panel panel-grupos">
            <section className="grupo-campos" aria-labelledby="titulo-pin">
              <div className="grupo-titulo">
                <h3 id="titulo-pin">PIN para el kiosco</h3>
                <p>
                  Con su número de empleado y este PIN checa en el kiosco. Entrégalo en privado: nadie puede verlo después; si
                  lo olvida, asigna uno nuevo. La persona también puede elegirlo en su app (Acceso).
                </p>
              </div>
              <div className="grupo-cuerpo">
                <p className="estado-grupo">
                  <span className={`insignia-estado ${tienePin ? "insignia-ok" : "insignia-neutra"}`}>{tienePin ? "PIN asignado" : "Sin PIN"}</span>
                </p>
                <FormAccion accion={asignarPin} boton={tienePin ? "Reemplazar PIN" : "Asignar PIN"} className="form-linea" limpiar>
                  <input type="hidden" name="trabajador_id" value={t.id} />
                  <label>
                    Nuevo PIN (4 a 6 dígitos)
                    <input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" required autoComplete="off" />
                  </label>
                </FormAccion>
                {!t.numero_empleado && <p className="mensaje mensaje-aviso">Sin número de empleado no podrá usar el kiosco. Captúralo en Datos.</p>}
                {t.numero_empleado && !/^\d+$/.test(t.numero_empleado) && (
                  <p className="mensaje mensaje-aviso">
                    El kiosco solo tiene teclado numérico: con el número “{t.numero_empleado}” no podrá checar ahí. Usa solo dígitos.
                  </p>
                )}
              </div>
            </section>

            <section className="grupo-campos" aria-labelledby="titulo-whatsapp">
              <div className="grupo-titulo">
                <h3 id="titulo-whatsapp">WhatsApp</h3>
                <p>
                  La persona escanea el QR con su celular (o escribe el código al número de WhatsApp de Checador) y queda
                  activado. El código sirve una vez, vence en 24 horas y se anula al quinto intento fallido.
                </p>
              </div>
              <div className="grupo-cuerpo">
                {t.telefono ? (
                  <>
                    <p className="estado-grupo">
                      <span className={`insignia-estado ${t.telefono_verificado_en ? "insignia-ok" : "insignia-aviso"}`}>
                        {t.telefono_verificado_en ? "Activado" : "Pendiente de activar"}
                      </span>{" "}
                      <span className="ayuda">
                        {t.telefono_verificado_en
                          ? "Genera un código solo si necesita activarlo de nuevo. Para cortar el acceso, borra o cambia el celular en Datos."
                          : "Genera el código y entrégalo en persona."}
                      </span>
                    </p>
                    <FormAccion accion={generarCodigoWhatsApp} boton={t.telefono_verificado_en ? "Generar código nuevo" : "Generar código de activación"} className="form-linea form-whatsapp">
                      <input type="hidden" name="trabajador_id" value={t.id} />
                    </FormAccion>
                  </>
                ) : (
                  <p className="ayuda">Sin celular. Para que cheque por WhatsApp, captura su celular en Datos y guarda.</p>
                )}
              </div>
            </section>
          </div>

          <h2>Baja</h2>
          <div className="form-panel panel-grupos panel-peligro">
            <section className="grupo-campos" aria-labelledby="titulo-baja">
              <div className="grupo-titulo">
                <h3 id="titulo-baja">Dar de baja</h3>
                <p>
                  Desde esa fecha ya no puede checar ni entrar. Sus registros no se borran: se conservan como exige el art. 804
                  de la LFT. Si fue un error, la baja se puede deshacer desde esta ficha.
                </p>
              </div>
              <div className="grupo-cuerpo">
                <FormAccion accion={darDeBaja} boton="Registrar baja" peligro className="form-linea">
                  <input type="hidden" name="trabajador_id" value={t.id} />
                  <label>Fecha de baja<input name="fecha_baja" type="date" required
                    defaultValue={aHoraLocal(new Date(), ctx.empresa.zonaHoraria).slice(0, 10)} /></label>
                  <label>Escribe BAJA para confirmar<input name="confirmar" required autoComplete="off" /></label>
                </FormAccion>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
