import "server-only";

import { timingSafeEqual } from "node:crypto";
import { generateRequestDetails } from "web-push";
import { contenidoAviso, resultadoEntrega, servicioPermitido, type TipoAviso } from "./avisos";
import { clienteSinSesion } from "./supabase/servicio";

export interface ConfigAvisos {
  secretoServicio: string;
  vapidPublica: string;
  vapidPrivada: string;
  contacto: string;
  hostsExtra: string;
}

/** Configuración del envío; null si falta algo (los avisos quedan apagados). */
export function configAvisos(): ConfigAvisos | null {
  const e = process.env;
  const secretoServicio = e.AVISOS_SECRETO_SERVICIO;
  const vapidPublica = e.VAPID_PUBLICA;
  const vapidPrivada = e.VAPID_PRIVADA;
  if (!secretoServicio || !vapidPublica || !vapidPrivada) return null;
  return {
    secretoServicio,
    vapidPublica,
    vapidPrivada,
    contacto: e.VAPID_CONTACTO || "https://checador.jemba.mx",
    hostsExtra: e.AVISOS_HOSTS_EXTRA ?? "",
  };
}

export function secretoValido(recibido: string | null, esperado: string): boolean {
  const a = Buffer.from(recibido ?? "");
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Grupo {
  user_id: string;
  tipo: TipoAviso;
  cantidad: number;
  avisos: number[];
  url: string;
  suscripciones: { id: string; endpoint: string; p256dh: string; auth: string }[] | null;
}

export interface ResumenEnvio {
  grupos: number;
  enviados: number;
  exitosas: number;
  caducadas: number;
  fallidas: number;
}

/** Envía los avisos pendientes que ya están en horario y anota el resultado en la base. */
export async function enviarAvisosPendientes(cfg: ConfigAvisos): Promise<ResumenEnvio> {
  const base = clienteSinSesion();
  const { data, error } = await base.rpc("avisos_por_enviar", { p_secreto: cfg.secretoServicio });
  if (error) throw error;
  const r = data as { ok: boolean; codigo?: string; grupos?: Grupo[] };
  if (!r.ok) throw new Error(`avisos_por_enviar: ${r.codigo}`);

  const enviados: number[] = [];
  const exitosas: string[] = [];
  const caducadas: string[] = [];
  const fallidas: string[] = [];

  for (const g of r.grupos ?? []) {
    const contenido = contenidoAviso(g.tipo, g.cantidad, g.url);
    const carga = JSON.stringify(contenido);
    let entregado = false;
    for (const s of g.suscripciones ?? []) {
      // Segunda revisión: solo servicios de entrega conocidos (además de la del registro).
      if (!servicioPermitido(s.endpoint, cfg.hostsExtra)) {
        caducadas.push(s.id);
        continue;
      }
      try {
        const d = generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, {
          vapidDetails: { subject: cfg.contacto, publicKey: cfg.vapidPublica, privateKey: cfg.vapidPrivada },
          TTL: 24 * 60 * 60,
          urgency: "normal",
          topic: g.tipo,
        });
        const res = await fetch(d.endpoint, {
          method: d.method,
          headers: d.headers as Record<string, string>,
          body: d.body ? new Uint8Array(d.body as Buffer) : undefined,
          signal: AbortSignal.timeout(10_000),
          redirect: "manual",
        });
        const fin = resultadoEntrega(res.status);
        if (fin === "exitosa") {
          exitosas.push(s.id);
          entregado = true;
        } else if (fin === "caducada") caducadas.push(s.id);
        else {
          fallidas.push(s.id);
          console.error("avisos: entrega fallida", res.status, new URL(s.endpoint).host);
        }
      } catch (e) {
        fallidas.push(s.id);
        console.error("avisos: error al entregar", e);
      }
    }
    if (entregado) enviados.push(...g.avisos);
  }

  const { error: e2 } = await base.rpc("avisos_registrar_envio", {
    p_secreto: cfg.secretoServicio,
    p_resultado: { enviados, exitosas, caducadas, fallidas },
  });
  if (e2) throw e2;
  return {
    grupos: r.grupos?.length ?? 0,
    enviados: enviados.length,
    exitosas: exitosas.length,
    caducadas: caducadas.length,
    fallidas: fallidas.length,
  };
}
