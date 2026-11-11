/**
 * Checada por WhatsApp: reglas puras (sin red ni base de datos) para poder probarlas.
 *
 * La checada NO pasa por ningún modelo de IA: de cada mensaje se obtiene una intención con
 * reglas fijas y solo se registra lo que el estado de la persona permite (igual que el kiosco).
 * La hora del registro es la del servidor al recibir el mensaje (art. 132 fr. XXXIV LFT:
 * el registro debe ser fidedigno); si WhatsApp entrega el mensaje tarde, no se registra.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { EstadoTrabajador, Incidencia, ResultadoSemana, Turno } from "@checador/jornada";

export type TipoChecada = "entrada" | "salida" | "inicio_pausa" | "fin_pausa";

/** Un botón deja de servir a los 10 minutos: evita registrar por tocar un mensaje viejo. */
export const VIGENCIA_BOTON_S = 10 * 60;
/** Un mensaje que WhatsApp entrega con más retraso que este no se registra (se pide reenviar). */
export const RETRASO_MAXIMO_S = 5 * 60;

export interface MensajeEntrante {
  id: string; // wamid
  telefono: string; // como lo entrega WhatsApp (México: 521XXXXXXXXXX)
  enviadoEn: number; // segundos Unix
  texto: string | null;
  boton: string | null; // id del botón tocado
}

/** Verifica X-Hub-Signature-256: HMAC-SHA256 del cuerpo crudo con el secreto de la app de Meta. */
export function firmaValida(cuerpo: string, cabecera: string | null, secretoApp: string): boolean {
  if (!cabecera?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", secretoApp).update(cuerpo, "utf8").digest();
  const recibido = Buffer.from(cabecera.slice(7), "hex");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** Mensajes de personas dirigidos a nuestro número. Ignora estados de entrega y otros números. */
export function mensajesDe(payload: unknown, idNumero: string): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (p?.object !== "whatsapp_business_account") return salida;
  for (const entrada of p.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const v = cambio.value as
        | { metadata?: { phone_number_id?: string }; messages?: Record<string, unknown>[] }
        | undefined;
      if (cambio.field !== "messages" || v?.metadata?.phone_number_id !== idNumero) continue;
      for (const m of v.messages ?? []) {
        const id = m.id;
        const de = m.from;
        const ts = Number(m.timestamp);
        if (typeof id !== "string" || typeof de !== "string" || !/^[0-9]{10,15}$/.test(de) || !Number.isFinite(ts)) continue;
        const texto = m.type === "text" ? ((m.text as { body?: unknown })?.body ?? null) : null;
        const interactivo = m.type === "interactive" ? (m.interactive as { button_reply?: { id?: unknown } }) : null;
        const boton = interactivo?.button_reply?.id;
        salida.push({
          id,
          telefono: de,
          enviadoEn: ts,
          texto: typeof texto === "string" ? texto.slice(0, 500) : null,
          boton: typeof boton === "string" ? boton.slice(0, 100) : null,
        });
      }
    }
  }
  return salida;
}

/** Identificador estable por mensaje (forma de UUID): si Meta reintenta la entrega, no se duplica la checada. */
export function idClienteDe(wamid: string): string {
  const h = createHash("sha256").update(`whatsapp:${wamid}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const ETIQUETA: Record<TipoChecada, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Iniciar pausa",
  fin_pausa: "Terminar pausa",
};

/** Lo único que se puede registrar en cada estado (mismas reglas que el kiosco). */
export function accionesValidas(estado: EstadoTrabajador): TipoChecada[] {
  if (estado === "fuera") return ["entrada"];
  if (estado === "en_pausa") return ["fin_pausa"];
  return ["inicio_pausa", "salida"];
}

export const idBoton = (tipo: TipoChecada, ahoraS: number) => `chk:${tipo}:${ahoraS + VIGENCIA_BOTON_S}`;

const sinAcentos = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const PALABRAS: [RegExp, TipoChecada][] = [
  [/^(checar |registrar |marcar )?(mi )?entrada$|^entre$|^ya llegue$|^llegue$/, "entrada"],
  [/^(checar |registrar |marcar )?(mi )?salida$|^sali$|^ya me voy$/, "salida"],
  [/^(terminar|fin|fin de|termine|regreso de|regrese de) (la )?(pausa|comida|descanso)$|^regreso$|^regrese$|^ya regrese$/, "fin_pausa"],
  [/^(iniciar |inicio |inicio de |tomar )?(la )?(pausa|comida|descanso)$|^(voy|salgo) a comer$/, "inicio_pausa"],
];

export type Intencion =
  | { clase: "checar"; tipo: TipoChecada }
  | { clase: "boton_vencido" }
  | { clase: "ver_semana"; lunes: string | null }
  | { clase: "conforme"; lunes: string; huella: string }
  | { clase: "objetar"; lunes: string }
  | { clase: "codigo"; codigo: string }
  | { clase: "otro" };

/** Qué quiere hacer la persona. Solo frases completas: "no he salido" no es una salida. */
export function intencionDe(m: MensajeEntrante, ahoraS: number): Intencion {
  if (m.boton) {
    const vence = Number(/:(\d{9,11})$/.exec(m.boton)?.[1]);
    let r = /^chk:(entrada|salida|inicio_pausa|fin_pausa):\d+$/.exec(m.boton);
    let intencion: Intencion | null = r ? { clase: "checar", tipo: r[1] as TipoChecada } : null;
    if ((r = /^sem:(\d{4}-\d{2}-\d{2}):\d+$/.exec(m.boton))) intencion = { clase: "ver_semana", lunes: r[1]! };
    if ((r = /^conf:(\d{4}-\d{2}-\d{2}):([0-9a-f]{12}):\d+$/.exec(m.boton))) intencion = { clase: "conforme", lunes: r[1]!, huella: r[2]! };
    if ((r = /^obj:(\d{4}-\d{2}-\d{2}):\d+$/.exec(m.boton))) intencion = { clase: "objetar", lunes: r[1]! };
    if (!intencion || !Number.isFinite(vence)) return { clase: "otro" };
    return vence >= ahoraS ? intencion : { clase: "boton_vencido" };
  }
  const crudo = (m.texto ?? "").trim();
  // Código de activación de un solo uso: seis dígitos, solos o después de "activar".
  const codigo = /^(?:activar\s+)?([0-9]{3})[\s-]?([0-9]{3})$/i.exec(crudo);
  if (codigo) return { clase: "codigo", codigo: `${codigo[1]}${codigo[2]}` };
  const t = sinAcentos(crudo);
  for (const [re, tipo] of PALABRAS) if (re.test(t)) return { clase: "checar", tipo };
  // La conformidad NO se acepta por texto: solo con el botón que acompaña al resumen de la semana.
  if (/^(revisar |ver )?(mi |la )?semana$|^revisar$/.test(t)) return { clase: "ver_semana", lunes: null };
  return { clase: "otro" };
}

export interface Boton {
  id: string;
  titulo: string; // máx. 20 caracteres (límite de WhatsApp)
}

export interface Respuesta {
  texto: string;
  /** Checadas que se ofrecen como botón (el id se genera al enviar, con su vigencia). */
  botones?: TipoChecada[];
  /** Otros botones (revisar semana, conformidad). Entre todos, máximo 3. */
  extra?: Boton[];
  /** Texto largo que se envía antes, como mensaje aparte (el cuerpo con botones admite 1024 caracteres). */
  previo?: string;
}

const ESTADO_TEXTO: Record<EstadoTrabajador, string> = {
  fuera: "No tienes un turno abierto.",
  trabajando: "Estás en turno.",
  en_pausa: "Estás en pausa.",
};

export function menu(nombre: string, estado: EstadoTrabajador, desde: string | null, prefijo = ""): Respuesta {
  const detalle = estado !== "fuera" && desde ? ` Entrada registrada a las ${desde}.` : "";
  return {
    texto: `${prefijo}${nombre.split(" ")[0]}, ${ESTADO_TEXTO[estado].toLowerCase()}${detalle}\n¿Qué quieres registrar?`,
    botones: accionesValidas(estado),
  };
}

const HECHO: Record<TipoChecada, string> = {
  entrada: "Entrada registrada",
  salida: "Salida registrada",
  inicio_pausa: "Inicio de pausa registrado",
  fin_pausa: "Fin de pausa registrado",
};

/** Confirmación con hora local y número de registro en la bitácora (sirve como acuse). */
export function confirmacion(tipo: TipoChecada, horaLocal: string, secuencia: number | string, empresa: string, duplicado: boolean): Respuesta {
  const siguiente = accionesValidas(tipo === "entrada" || tipo === "fin_pausa" ? "trabajando" : tipo === "inicio_pausa" ? "en_pausa" : "fuera");
  return {
    texto:
      `✅ ${HECHO[tipo]} a las ${horaLocal.slice(11)} del ${horaLocal.slice(8, 10)}/${horaLocal.slice(5, 7)}.\n` +
      `${empresa} · registro n.º ${secuencia}` +
      (duplicado ? "\n(Ya estaba registrado; no se duplicó.)" : ""),
    botones: tipo === "salida" ? undefined : siguiente,
  };
}

export const TEXTOS = {
  noRegistrado:
    "Este número no está registrado en Checador. Si trabajas en una empresa que lo usa, pide que capturen tu celular en tu ficha.",
  sinCodigo:
    "Tu empresa ya registró este número. Para activarlo, pide a tu empresa tu código de activación de WhatsApp (6 dígitos) y escríbelo aquí.",
  pedirCodigo:
    "Hola. Para activar tu checada por WhatsApp escribe el código de activación de 6 dígitos que te dio tu empresa. Solo se pide una vez.",
  codigoIncorrecto: (restantes: number) =>
    `Código incorrecto. Revísalo e intenta de nuevo (${restantes === 1 ? "queda 1 intento" : `quedan ${restantes} intentos`}).`,
  codigoAnulado: "Demasiados intentos: el código se anuló. Pide a tu empresa que genere uno nuevo.",
  vinculado: (nombre: string) => `Listo, ${nombre.split(" ")[0]}: tu WhatsApp quedó activado. El código ya no sirve; no necesitas guardarlo.`,
  tarde: "Tu mensaje llegó con retraso y no se registró. Envíalo de nuevo para registrar con la hora actual.",
  error: "No se pudo registrar. Intenta de nuevo en un momento; si sigue fallando, avisa a tu empresa.",
} as const;

// ---------------------------------------------------------------------------
// Conformidad semanal (art. 132 fr. XXXIV LFT; cláusula séptima del acuerdo de registro)
// ---------------------------------------------------------------------------

/** Revisar una semana toma más que checar: estos botones duran 30 minutos. */
export const VIGENCIA_REVISION_S = 30 * 60;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const fechaUtc = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** "2 al 8 de nov" o "30 de nov al 6 de dic". */
export function rangoSemana(lunes: string): string {
  const a = fechaUtc(lunes);
  const b = new Date(a.getTime() + 6 * 86_400_000);
  const mesA = MESES[a.getUTCMonth()];
  const mesB = MESES[b.getUTCMonth()];
  return mesA === mesB ? `${a.getUTCDate()} al ${b.getUTCDate()} de ${mesB}` : `${a.getUTCDate()} de ${mesA} al ${b.getUTCDate()} de ${mesB}`;
}

export const horasMin = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;

/** Huella corta de lo que se mostró: el botón "Estoy conforme" solo vale para esos mismos registros. */
export function huellaResumen(resumen: unknown): string {
  return createHash("sha256").update(JSON.stringify(resumen)).digest("hex").slice(0, 12);
}

/** Resumen de la semana en texto plano: turnos por día, total e incidencias. */
export function textoSemana(
  lunes: string,
  semana: Pick<ResultadoSemana, "dias" | "totales">,
  turnos: readonly Turno[],
  incidencias: readonly Incidencia[],
): string {
  const lineas = [`*Semana del ${rangoSemana(lunes)}*`];
  for (const dia of semana.dias) {
    const delDia = turnos.filter((t) => t.inicio.slice(0, 10) === dia.fecha);
    if (!delDia.length) continue;
    const f = fechaUtc(dia.fecha);
    const tramos = delDia.map((t) => {
      const otroDia = t.fin.slice(0, 10) !== t.inicio.slice(0, 10) ? " (+1)" : "";
      const pausas = (t.pausas ?? []).map((p) => `${p.inicio.slice(11)}–${p.fin.slice(11)}`).join(", ");
      return `${t.inicio.slice(11)}–${t.fin.slice(11)}${otroDia}${pausas ? ` (pausa ${pausas})` : ""}`;
    });
    lineas.push(`${DIAS_CORTOS[f.getUTCDay()]} ${f.getUTCDate()}: ${tramos.join(" y ")} · ${horasMin(dia.trabajadoMin)}`);
  }
  if (lineas.length === 1) lineas.push("Sin turnos completos registrados.");
  const t = semana.totales;
  lineas.push(`Total trabajado: ${horasMin(t.trabajadoMin)}`);
  if (t.extraDobleMin || t.extraTripleMin) {
    lineas.push(`Ordinario ${horasMin(t.ordinariaMin)} · extra doble ${horasMin(t.extraDobleMin)} · extra triple ${horasMin(t.extraTripleMin)}`);
  }
  for (const i of incidencias.slice(0, 5)) lineas.push(`⚠ ${i.mensaje}`);
  return lineas.join("\n");
}

const PREGUNTA = "¿Son correctos estos registros? Si no respondes, no cuenta como conformidad.";

/** El resumen con los botones de conformidad y objeción. */
export function revisionSemana(lunes: string, resumen: string, huella: string, ahoraS: number, prefijo = ""): Respuesta {
  const vence = ahoraS + VIGENCIA_REVISION_S;
  const extra: Boton[] = [
    { id: `conf:${lunes}:${huella}:${vence}`, titulo: "Estoy conforme" },
    { id: `obj:${lunes}:${vence}`, titulo: "No es correcto" },
  ];
  const junto = `${prefijo}${resumen}\n\n${PREGUNTA}`;
  return junto.length <= 1000 ? { texto: junto, extra } : { previo: `${prefijo}${resumen}`.slice(0, 4000), texto: PREGUNTA, extra };
}

/** Añade a una respuesta el aviso de la semana pendiente más antigua, si cabe otro botón. */
export function conAviso(r: Respuesta, pendientes: readonly { lunes: string }[], ahoraS: number): Respuesta {
  const primera = pendientes[0];
  if (!primera || (r.botones?.length ?? 0) + (r.extra?.length ?? 0) >= 3) return r;
  const cuantas = pendientes.length === 1 ? `la semana del ${rangoSemana(primera.lunes)}` : `${pendientes.length} semanas`;
  return {
    ...r,
    texto: `${r.texto}\n\nTienes ${cuantas} por revisar.`,
    extra: [...(r.extra ?? []), { id: `sem:${primera.lunes}:${ahoraS + VIGENCIA_REVISION_S}`, titulo: "Revisar semana" }],
  };
}

export const TEXTOS_SEMANA = {
  sinPendientes: "No tienes semanas por revisar.",
  yaNoPendiente: "Esa semana ya no está pendiente de revisar.",
  cambio: "Tus registros de esa semana cambiaron desde que los viste. Revísalos de nuevo:\n\n",
  pedirObjecion: (lunes: string) =>
    `Escribe en un solo mensaje qué no es correcto de la semana del ${rangoSemana(lunes)} (día y hora). Tienes 15 minutos; si no escribes nada, no se registra ninguna respuesta.`,
  conforme: (lunes: string, n: number | string) =>
    `✅ Conformidad registrada: semana del ${rangoSemana(lunes)} · comprobante n.º ${n}.`,
  objecion: (lunes: string, n: number | string) =>
    `Objeción registrada: semana del ${rangoSemana(lunes)} · comprobante n.º ${n}. Tu empresa debe revisarla; si corrige los registros, podrás revisarlos de nuevo.`,
} as const;
