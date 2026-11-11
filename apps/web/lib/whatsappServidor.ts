import "server-only";

import { createClient } from "@supabase/supabase-js";
import { aHoraLocal, reconstruirTurnos } from "@checador/jornada";
import { configSupabase } from "./supabase/config";
import {
  ETIQUETA,
  RETRASO_MAXIMO_S,
  TEXTOS,
  accionesValidas,
  confirmacion,
  idBoton,
  idClienteDe,
  intencionDe,
  menu,
  type MensajeEntrante,
  type Respuesta,
} from "./whatsapp";

export interface ConfigWhatsApp {
  tokenVerificacion: string;
  secretoApp: string;
  token: string;
  idNumero: string;
  secretoServicio: string;
  urlGraph: string;
}

/** Configuración del canal; null si falta algo (el canal queda apagado y el webhook responde 503). */
export function configWhatsApp(): ConfigWhatsApp | null {
  const e = process.env;
  const [tokenVerificacion, secretoApp, token, idNumero, secretoServicio] = [
    e.WHATSAPP_VERIFY_TOKEN, e.WHATSAPP_APP_SECRET, e.WHATSAPP_TOKEN, e.WHATSAPP_PHONE_ID, e.WHATSAPP_SECRETO_SERVICIO,
  ];
  if (!tokenVerificacion || !secretoApp || !token || !idNumero || !secretoServicio) return null;
  const urlGraph = (e.WHATSAPP_GRAPH_URL ?? "https://graph.facebook.com/v24.0").replace(/\/$/, "");
  return { tokenVerificacion, secretoApp, token, idNumero, secretoServicio, urlGraph };
}

/**
 * Cliente sin sesión (rol anon): el webhook no tiene usuario. Solo puede ejecutar las funciones
 * whatsapp_*(), que exigen el secreto de servicio. Nunca se usa la llave service_role.
 */
function clienteBase() {
  const { url, key } = configSupabase();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface Estado {
  ok: boolean;
  codigo?: string;
  registrado?: boolean;
  vinculado?: boolean;
  tiene_codigo?: boolean;
  nombre?: string;
  empresa?: string;
  zona_horaria?: string;
  eventos?: {
    id: number;
    tipo: "entrada" | "salida" | "inicio_pausa" | "fin_pausa" | "correccion" | "anulacion";
    hora_efectiva: string;
    puede_salir: boolean | null;
    corrige_evento_id: number | null;
    diferido: boolean;
  }[];
}

/** Atiende un mensaje y devuelve la respuesta para la persona. */
export async function atender(m: MensajeEntrante, cfg: ConfigWhatsApp, ahora = new Date()): Promise<Respuesta> {
  const base = clienteBase();
  const ahoraS = Math.floor(ahora.getTime() / 1000);
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await base.rpc(fn, { p_secreto: cfg.secretoServicio, p_telefono: m.telefono, ...args });
    if (error) throw error;
    const r = data as T & { ok: boolean; codigo?: string };
    if (!r.ok && r.codigo === "NO_AUTORIZADO") throw new Error("El secreto de servicio de WhatsApp no coincide con el de la base.");
    return r;
  };

  const estado = await rpc<Estado>("whatsapp_estado", {});
  // Fase 2: los mensajes de números no registrados se reenviarán al asistente (Forja).
  if (!estado.registrado) return { texto: TEXTOS.noRegistrado };

  const intencion = intencionDe(m, ahoraS);

  if (!estado.vinculado) {
    if (!estado.tiene_codigo) return { texto: TEXTOS.sinCodigo };
    if (intencion.clase !== "codigo") return { texto: TEXTOS.pedirCodigo };
    const v = await rpc<{ nombre?: string; restantes?: number }>("whatsapp_vincular", { p_codigo: intencion.codigo });
    if (v.ok) {
      const e = await rpc<Estado>("whatsapp_estado", {});
      const { estado: est, enCurso } = reconstruir(e);
      return menu(v.nombre ?? "", est, enCurso, `${TEXTOS.vinculado(v.nombre ?? "")}\n\n`);
    }
    if (v.codigo === "ANULADO") return { texto: TEXTOS.codigoAnulado };
    if (v.codigo === "INCORRECTO") return { texto: TEXTOS.codigoIncorrecto(v.restantes ?? 1) };
    return { texto: TEXTOS.sinCodigo };
  }

  const { estado: est, enCurso } = reconstruir(estado, ahora);
  const nombre = estado.nombre ?? "";
  if (intencion.clase === "boton_vencido") return menu(nombre, est, enCurso, "Ese botón ya venció. ");
  if (intencion.clase !== "checar") return menu(nombre, est, enCurso);
  if (!accionesValidas(est).includes(intencion.tipo)) {
    return menu(nombre, est, enCurso, `No se puede registrar "${ETIQUETA[intencion.tipo]}" ahora. `);
  }
  if (ahoraS - m.enviadoEn > RETRASO_MAXIMO_S) return { texto: TEXTOS.tarde, botones: accionesValidas(est) };

  const c = await rpc<{ hora_efectiva?: string; secuencia?: number; duplicado?: boolean }>("whatsapp_checar", {
    p_tipo: intencion.tipo,
    p_id_cliente: idClienteDe(m.id),
    p_evidencia: { wamid: m.id, enviado_en: new Date(m.enviadoEn * 1000).toISOString(), medio: m.boton ? "boton" : "texto" },
  });
  if (!c.ok || !c.hora_efectiva) return { texto: TEXTOS.error };
  const zona = estado.zona_horaria ?? "America/Mexico_City";
  return confirmacion(intencion.tipo, aHoraLocal(c.hora_efectiva, zona), c.secuencia ?? "", estado.empresa ?? "", c.duplicado ?? false);
}

function reconstruir(e: Estado, ahora = new Date()) {
  const { estado, enCurso } = reconstruirTurnos(
    (e.eventos ?? []).map((ev) => ({
      id: ev.id,
      tipo: ev.tipo,
      horaEfectiva: ev.hora_efectiva,
      puedeSalir: ev.puede_salir,
      corrigeEventoId: ev.corrige_evento_id,
      diferido: ev.diferido,
    })),
    e.zona_horaria ?? "America/Mexico_City",
    ahora,
  );
  return { estado, enCurso: enCurso?.inicio.slice(11) ?? null };
}

/** Envía la respuesta por la API de WhatsApp (Graph API). Hasta 3 botones de respuesta rápida. */
export async function responder(telefono: string, r: Respuesta, cfg: ConfigWhatsApp, ahora = new Date()): Promise<void> {
  const ahoraS = Math.floor(ahora.getTime() / 1000);
  const mensaje = r.botones?.length
    ? {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: r.texto },
          action: {
            buttons: r.botones.slice(0, 3).map((t) => ({ type: "reply", reply: { id: idBoton(t, ahoraS), title: ETIQUETA[t] } })),
          },
        },
      }
    : { type: "text", text: { body: r.texto } };
  const res = await fetch(`${cfg.urlGraph}/${cfg.idNumero}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: telefono, ...mensaje }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`WhatsApp respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
