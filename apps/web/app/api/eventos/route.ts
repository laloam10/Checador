import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";
import { evidenciaDe } from "@/lib/evidencia";

const TIPOS = new Set(["entrada", "salida", "inicio_pausa", "fin_pausa"]);
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Cuerpo {
  trabajadorId?: unknown;
  tipo?: unknown;
  idCliente?: unknown;
  diferido?: unknown;
  horaDispositivo?: unknown;
}

/** Registra una checada del trabajador (PWA). La hora la fija el servidor. */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) return error(401, "Sesión expirada. Vuelve a entrar.");

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return error(400, "Solicitud inválida.");
  }
  const { trabajadorId, tipo, idCliente, diferido, horaDispositivo } = cuerpo;
  if (typeof trabajadorId !== "string" || !RE_UUID.test(trabajadorId)) return error(400, "Trabajador inválido.");
  if (typeof tipo !== "string" || !TIPOS.has(tipo)) return error(400, "Tipo de evento inválido.");
  if (typeof idCliente !== "string" || !RE_UUID.test(idCliente)) return error(400, "Identificador inválido.");
  const esDiferido = diferido === true;
  if (esDiferido && (typeof horaDispositivo !== "string" || Number.isNaN(Date.parse(horaDispositivo)))) {
    return error(400, "Hora del dispositivo inválida.");
  }

  const { data: trabajador } = await supabase
    .from("trabajadores")
    .select("empresa_id")
    .eq("id", trabajadorId)
    .eq("user_id", userId)
    .is("fecha_baja", null)
    .maybeSingle();
  if (!trabajador) return error(403, "No tienes un registro de trabajador activo.");

  const { error: errInsert } = await supabase.from("eventos").insert({
    empresa_id: trabajador.empresa_id,
    trabajador_id: trabajadorId,
    tipo,
    origen: "pwa",
    // puede_salir lo impone el centro de trabajo en la base (art. 64).
    diferido: esDiferido,
    hora_dispositivo: esDiferido ? horaDispositivo : null,
    id_cliente: idCliente,
    evidencia: evidenciaDe(request),
  });

  if (errInsert) {
    // Reintento de un envío que ya se había guardado: no es un error.
    if (errInsert.code === "23505" && errInsert.message.includes("id_cliente")) {
      return NextResponse.json({ ok: true, duplicado: true, horaServidor: new Date().toISOString() });
    }
    if (errInsert.code === "42501") return error(403, "No tienes permiso para registrar este evento.");
    if (errInsert.code === "23514") return error(422, errInsert.message);
    console.error("Error al registrar evento", errInsert);
    return error(500, "No se pudo registrar. Intenta de nuevo.");
  }

  return NextResponse.json({ ok: true, horaServidor: new Date().toISOString() });
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
