import { NextResponse, type NextRequest } from "next/server";
import { reconstruirTurnos } from "@checador/jornada";
import { crearClienteServidor, usuarioActual } from "@/lib/supabase/server";
import { estadoHttp, miKiosco, validarCredenciales, type RespuestaKiosco } from "@/lib/kiosco";

/**
 * Verifica número de empleado y PIN y devuelve el estado del trabajador
 * (fuera, trabajando o en pausa) para mostrar solo las acciones válidas.
 * No devuelve el historial: en un dispositivo compartido solo se muestra el nombre.
 */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const userId = await usuarioActual(supabase);
  if (!userId) return NextResponse.json({ ok: false, error: "Sesión del kiosco expirada." }, { status: 401 });

  const { numero, pin } = (await request.json().catch(() => ({}))) as { numero?: unknown; pin?: unknown };
  const invalido = validarCredenciales(numero, pin);
  if (invalido) return NextResponse.json({ ok: false, error: invalido }, { status: 400 });

  const kiosco = await miKiosco(supabase, userId);
  if (!kiosco) return NextResponse.json({ ok: false, error: "Este dispositivo no está configurado como kiosco." }, { status: 403 });

  const { data, error } = await supabase.rpc("kiosco_identificar", { p_numero: numero, p_pin: pin });
  if (error) {
    console.error("kiosco_identificar", error);
    return NextResponse.json({ ok: false, error: "No se pudo verificar. Intenta de nuevo." }, { status: 500 });
  }
  const r = data as RespuestaKiosco;
  if (!r.ok) return NextResponse.json({ ok: false, codigo: r.codigo, error: r.error }, { status: estadoHttp(r) });

  const { estado, enCurso } = reconstruirTurnos(
    (r.eventos ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      horaEfectiva: e.hora_efectiva,
      puedeSalir: e.puede_salir,
      corrigeEventoId: e.corrige_evento_id,
      diferido: e.diferido,
    })),
    kiosco.zonaHoraria,
  );

  return NextResponse.json({
    ok: true,
    nombre: r.nombre,
    estado,
    desde: enCurso?.inicio.slice(11) ?? null,
    acuerdoPendiente: r.acuerdo_pendiente ?? null,
    horaServidor: new Date().toISOString(),
  });
}
