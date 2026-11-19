import { NextResponse, type NextRequest } from "next/server";
import { configAvisos, enviarAvisosPendientes, secretoValido } from "@/lib/avisosServidor";

/**
 * Envía los avisos pendientes. La llama la base de datos (pg_cron + pg_net) cada 10 minutos,
 * solo si hay avisos en cola, con el secreto de servicio en X-Checador-Secreto.
 * Sin la configuración de avisos responde 503 y no hace nada.
 */
export async function POST(request: NextRequest) {
  const cfg = configAvisos();
  if (!cfg) return NextResponse.json({ ok: false, error: "Avisos no configurados." }, { status: 503 });
  if (!secretoValido(request.headers.get("x-checador-secreto"), cfg.secretoServicio)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await enviarAvisosPendientes(cfg)) });
  } catch (e) {
    console.error("avisos: envío", e);
    return NextResponse.json({ ok: false, error: "No se pudo completar el envío." }, { status: 500 });
  }
}
