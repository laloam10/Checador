import { NextResponse, type NextRequest } from "next/server";
import { aHoraLocal } from "@checador/jornada";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";
import { lunesDe, misTrabajadores, semanaDeTrabajador, sumarDias } from "@/lib/datos";
import { evidenciaDe } from "@/lib/evidencia";

const VERSION_RESUMEN = 1;

/**
 * Conformidad del trabajador con una semana cerrada (prueba plena, art. 132 XXXIV).
 * El resumen se recalcula en el servidor: lo que se guarda es exactamente lo que
 * muestra la pantalla de registros, no lo que envíe el navegador.
 */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) return error(401, "Sesión expirada. Vuelve a entrar.");

  let cuerpo: { trabajadorId?: unknown; semana?: unknown; respuesta?: unknown; comentario?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return error(400, "Solicitud inválida.");
  }
  const { trabajadorId, semana, respuesta, comentario } = cuerpo;
  if (respuesta !== "conforme" && respuesta !== "objeta") return error(400, "Respuesta inválida.");
  if (typeof semana !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(semana) || lunesDe(semana) !== semana) {
    return error(400, "La semana debe iniciar en lunes.");
  }
  const texto = typeof comentario === "string" ? comentario.trim().slice(0, 2000) : "";
  if (respuesta === "objeta" && !texto) return error(400, "Explica qué registro no es correcto.");

  const trabajador = (await misTrabajadores(supabase, userId)).find((t) => t.id === trabajadorId);
  if (!trabajador) return error(403, "No tienes un registro de trabajador activo.");

  const hoyLocal = aHoraLocal(new Date(), trabajador.zonaHoraria).slice(0, 10);
  const domingo = sumarDias(semana, 6);
  if (domingo >= hoyLocal) return error(422, "Solo puedes dar tu conformidad de semanas ya terminadas.");

  const { semana: calculo, reconstruccion, eventoIds } = await semanaDeTrabajador(supabase, trabajador, semana);
  const resumen = {
    version: VERSION_RESUMEN,
    semana,
    totales: calculo.totales,
    dias: calculo.dias,
    alertas: calculo.alertas.map((a) => a.codigo),
    incidencias: reconstruccion.incidencias,
    eventoIds,
  };

  const { data, error: err } = await supabase
    .from("conformidades")
    .insert({
      empresa_id: trabajador.empresaId,
      trabajador_id: trabajador.id,
      periodo_inicio: semana,
      periodo_fin: domingo,
      resumen,
      respuesta,
      comentario: texto || null,
      evidencia: evidenciaDe(request),
    })
    .select("cadena_secuencia, cadena_hash, resumen_hash, respondido_en")
    .single();

  if (err) {
    console.error("Error al registrar conformidad", err);
    return error(500, "No se pudo registrar tu respuesta. Intenta de nuevo.");
  }
  return NextResponse.json({ ok: true, comprobante: data });
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
