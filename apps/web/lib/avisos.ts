/**
 * Avisos por notificación (Web Push): reglas puras, sin red ni base de datos, para poder probarlas.
 *
 * El texto no lleva horas ni datos de la persona: una notificación se lee con el teléfono
 * bloqueado. Un aviso no tiene efecto legal; solo invita a revisar, firmar o consultar
 * (art. 132 fr. XXXIV LFT: la conformidad y la firma se dan en la app, no aquí).
 */

export type TipoAviso = "semana" | "acuerdo" | "correccion";

export const TIPOS_AVISO: { tipo: TipoAviso; etiqueta: string; detalle: string }[] = [
  { tipo: "semana", etiqueta: "Semanas por revisar", detalle: "Cuando termina una semana que no has revisado, o tu empresa corrige una que objetaste." },
  { tipo: "acuerdo", etiqueta: "Acuerdo por firmar", detalle: "Cuando tu empresa firma un acuerdo de registro que espera tu firma." },
  { tipo: "correccion", etiqueta: "Cambios en tus registros", detalle: "Cuando tu empresa corrige, anula o agrega uno de tus registros." },
];

export interface ContenidoAviso {
  titulo: string;
  cuerpo: string;
  url: string;
  /** Una notificación nueva del mismo tipo reemplaza a la anterior en el teléfono. */
  etiqueta: string;
}

/** Varios avisos del mismo tipo llegan como una sola notificación. */
export function contenidoAviso(tipo: TipoAviso, cantidad: number, url: string): ContenidoAviso {
  const n = Math.max(1, Math.floor(cantidad));
  const ligaSegura = /^\/[A-Za-z0-9/?=&_-]*$/.test(url) ? url : "/";
  switch (tipo) {
    case "semana":
      return {
        titulo: n === 1 ? "Tienes una semana por revisar" : `Tienes ${n} semanas por revisar`,
        cuerpo: "Revisa tus horas y dinos si son correctas. Responder es voluntario.",
        url: ligaSegura,
        etiqueta: "checador-semana",
      };
    case "acuerdo":
      return {
        titulo: "Tienes un acuerdo por firmar",
        cuerpo: "Tu empresa firmó el acuerdo de registro de tu jornada. Léelo con calma antes de firmar.",
        url: ligaSegura,
        etiqueta: "checador-acuerdo",
      };
    case "correccion":
      return {
        titulo: n === 1 ? "Tu empresa modificó uno de tus registros" : `Tu empresa modificó ${n} de tus registros`,
        cuerpo: "Revísalo en Mis registros. Si no es correcto, puedes objetar la semana.",
        url: ligaSegura,
        etiqueta: "checador-correccion",
      };
  }
}

/**
 * Servicios de entrega de los navegadores. Solo se envía a ellos: así nadie puede registrar
 * una dirección cualquiera para que el servidor de Checador haga peticiones a donde quiera.
 */
const SERVICIOS_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge en Android y escritorio
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, // Safari (iPhone con la app en la pantalla de inicio, Mac)
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/, // Edge en Windows
];

/** `extra`: hosts adicionales separados por coma (solo para pruebas locales, con http). */
export function servicioPermitido(endpoint: string, extra = ""): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  const adicionales = extra.split(",").map((h) => h.trim()).filter(Boolean);
  if (adicionales.includes(u.host)) return u.protocol === "https:" || u.protocol === "http:";
  return u.protocol === "https:" && !u.port && SERVICIOS_PUSH.some((re) => re.test(u.hostname));
}

const RE_LLAVE = /^[A-Za-z0-9_-]+={0,2}$/;

/** Valida la suscripción que manda el navegador (PushSubscription.toJSON()). */
export function suscripcionValida(
  s: unknown,
  extra = "",
): { endpoint: string; p256dh: string; auth: string } | null {
  const v = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = v?.endpoint;
  const p256dh = v?.keys?.p256dh;
  const auth = v?.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !servicioPermitido(endpoint, extra)) return null;
  if (typeof p256dh !== "string" || p256dh.length < 80 || p256dh.length > 100 || !RE_LLAVE.test(p256dh)) return null;
  if (typeof auth !== "string" || auth.length < 16 || auth.length > 32 || !RE_LLAVE.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Cómo terminó el envío a un dispositivo, según la respuesta del servicio de entrega. */
export function resultadoEntrega(estado: number): "exitosa" | "caducada" | "fallida" {
  if (estado >= 200 && estado < 300) return "exitosa";
  if (estado === 404 || estado === 410) return "caducada";
  return "fallida";
}
