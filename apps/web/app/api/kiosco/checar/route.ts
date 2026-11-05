import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";
import { evidenciaDe } from "@/lib/evidencia";
import { estadoHttp, validarCredenciales, type RespuestaKiosco } from "@/lib/kiosco";

const TIPOS = new Set(["entrada", "salida", "inicio_pausa", "fin_pausa"]);
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Registra una checada desde el kiosco. El PIN se verifica en la base (kiosco_checar). */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) return NextResponse.json({ ok: false, error: "Sesión del kiosco expirada." }, { status: 401 });

  const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { numero, pin, tipo, idCliente, diferido, horaDispositivo } = cuerpo;
  const invalido = validarCredenciales(numero, pin);
  if (invalido) return NextResponse.json({ ok: false, error: invalido }, { status: 400 });
  if (typeof tipo !== "string" || !TIPOS.has(tipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de checada inválido." }, { status: 400 });
  }
  if (typeof idCliente !== "string" || !RE_UUID.test(idCliente)) {
    return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
  }
  const esDiferido = diferido === true;
  if (esDiferido && (typeof horaDispositivo !== "string" || Number.isNaN(Date.parse(horaDispositivo)))) {
    return NextResponse.json({ ok: false, error: "Hora del dispositivo inválida." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("kiosco_checar", {
    p_numero: numero,
    p_pin: pin,
    p_tipo: tipo,
    p_id_cliente: idCliente,
    p_diferido: esDiferido,
    p_hora_dispositivo: esDiferido ? horaDispositivo : null,
    p_evidencia: evidenciaDe(request),
  });
  if (error) {
    console.error("kiosco_checar", error);
    return NextResponse.json({ ok: false, error: "No se pudo registrar. Intenta de nuevo." }, { status: 500 });
  }
  const r = data as RespuestaKiosco;
  const horaServidor = new Date().toISOString();
  if (!r.ok) {
    return NextResponse.json({ ok: false, codigo: r.codigo, error: r.error, horaServidor }, { status: estadoHttp(r) });
  }
  return NextResponse.json({
    ok: true,
    nombre: r.nombre,
    duplicado: r.duplicado ?? false,
    horaEfectiva: r.hora_efectiva ?? null,
    horaServidor,
  });
}
