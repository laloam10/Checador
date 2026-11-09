import Link from "next/link";
import { notFound } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { CamposTrabajador } from "@/components/panel/CamposTrabajador";
import { SeccionAcuerdo } from "@/components/panel/SeccionAcuerdo";
import { esGestor, requierePanel } from "@/lib/panel";
import { asignarPin, darDeBaja, guardarTrabajador, revertirBaja } from "../../acciones";

export default async function FichaTrabajador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requierePanel();
  const [{ data: t }, { data: centros }, { data: conPin }, { data: historial }] = await Promise.all([
    ctx.supabase
      .from("trabajadores")
      .select("id, nombre, numero_empleado, email, curp, user_id, centro_trabajo_id, fecha_ingreso, fecha_baja, dia_descanso, jornada_pactada_min")
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
  ]);
  if (!t) notFound();
  const gestor = esGestor(ctx.rol);
  const tienePin = ((conPin ?? []) as string[]).includes(t.id);

  return (
    <>
      <p><Link href="/panel/trabajadores">← Trabajadores</Link></p>
      <h1>{t.nombre}{t.fecha_baja && <small className="ayuda"> · baja el {t.fecha_baja}</small>}</h1>
      <p>
        <Link href={`/panel/trabajadores/${t.id}/semana`}>Ver registros y corregir checadas →</Link>
        {" · "}
        <Link href={`/panel/exportar?trabajador=${t.id}`}>Exportar para inspección →</Link>
      </p>
      <p className="ayuda">
        App del celular: {t.user_id ? "vinculada" : t.email ? `pendiente (entrará con ${t.email})` : "sin correo"} ·
        PIN de kiosco: {tienePin ? "asignado" : "sin asignar"}
      </p>

      {t.fecha_baja && (
        <p className="mensaje mensaje-aviso">
          Dado de baja el {t.fecha_baja}. Ya no puede checar; sus registros se conservan como exige el art. 804 de la LFT.
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
                <strong>{h.accion === "baja" ? `Baja con fecha ${h.fecha_baja}` : `Baja del ${h.fecha_baja} deshecha`}</strong>
                <span className="ayuda"> · registrado el {aHoraLocal(h.creado_en, ctx.empresa.zonaHoraria).replace("T", " ")}</span>
                {h.motivo && <span className="ajuste">Motivo: {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!t.fecha_baja && <SeccionAcuerdo ctx={ctx} trabajadorId={t.id} gestor={gestor} />}

      {gestor && !t.fecha_baja && (
        <>
          <h2>Datos</h2>
          <FormAccion accion={guardarTrabajador} boton="Guardar cambios">
            <CamposTrabajador centros={centros ?? []} t={{ ...t, jornada_pactada_min: t.jornada_pactada_min as Record<string, number> | null }} />
          </FormAccion>

          <h2>PIN para el kiosco</h2>
          <FormAccion accion={asignarPin} boton={tienePin ? "Reemplazar PIN" : "Asignar PIN"} className="form-panel form-linea" limpiar>
            <input type="hidden" name="trabajador_id" value={t.id} />
            <label>
              Nuevo PIN (4 a 6 dígitos)
              <input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" required autoComplete="off" />
            </label>
          </FormAccion>
          {!t.numero_empleado && <p className="mensaje mensaje-aviso">Sin número de empleado no podrá usar el kiosco.</p>}
          {t.numero_empleado && !/^\d+$/.test(t.numero_empleado) && (
            <p className="mensaje mensaje-aviso">
              El kiosco solo tiene teclado numérico: con el número “{t.numero_empleado}” no podrá checar ahí. Usa solo dígitos.
            </p>
          )}

          <h2>Baja</h2>
          <FormAccion accion={darDeBaja} boton="Registrar baja" peligro className="form-panel form-linea">
            <input type="hidden" name="trabajador_id" value={t.id} />
            <label>Fecha de baja<input name="fecha_baja" type="date" required
              defaultValue={aHoraLocal(new Date(), ctx.empresa.zonaHoraria).slice(0, 10)} /></label>
            <label>Escribe BAJA para confirmar<input name="confirmar" required autoComplete="off" /></label>
          </FormAccion>
          <p className="ayuda">Los registros del trabajador no se borran: se conservan como exige el art. 804 de la LFT.</p>
        </>
      )}
    </>
  );
}
