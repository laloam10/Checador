import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { firmaValida, mensajesDe, TEXTOS } from "@/lib/whatsapp";
import { atender, configWhatsApp, responder } from "@/lib/whatsappServidor";

/**
 * Webhook de WhatsApp (Cloud API de Meta). Un solo número atiende a todas las empresas.
 *
 * Seguridad: solo se procesa un cuerpo firmado por Meta con el secreto de la app
 * (X-Hub-Signature-256). El remitente de cada mensaje lo certifica Meta, no el cliente.
 * Si faltan las variables de entorno, el canal está apagado (503).
 */

const apagado = () => NextResponse.json({ ok: false, error: "Canal de WhatsApp no configurado." }, { status: 503 });

/** Verificación del webhook al darlo de alta en Meta. */
export async function GET(request: NextRequest) {
  const cfg = configWhatsApp();
  if (!cfg) return apagado();
  const q = request.nextUrl.searchParams;
  const recibido = Buffer.from(q.get("hub.verify_token") ?? "");
  const esperado = Buffer.from(cfg.tokenVerificacion);
  const coincide = recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
  if (q.get("hub.mode") !== "subscribe" || !coincide) return new NextResponse("Prohibido", { status: 403 });
  return new NextResponse(q.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const cfg = configWhatsApp();
  if (!cfg) return apagado();
  const cuerpo = await request.text();
  if (!firmaValida(cuerpo, request.headers.get("x-hub-signature-256"), cfg.secretoApp)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Siempre se responde 200 a un cuerpo firmado: si no, Meta reintenta y puede dar de baja el webhook.
  // La checada es idempotente por id de mensaje, así que un reintento no duplica.
  for (const m of mensajesDe(payload, cfg.idNumero)) {
    try {
      const respuesta = await atender(m, cfg).catch((e) => {
        console.error("whatsapp atender", e);
        return { texto: TEXTOS.error };
      });
      await responder(m.telefono, respuesta, cfg);
    } catch (e) {
      console.error("whatsapp responder", e);
    }
  }
  return NextResponse.json({ ok: true });
}
