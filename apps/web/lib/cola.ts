"use client";

import { del, get, set } from "idb-keyval";

/**
 * Cola de checadas sin conexión (IndexedDB) y desfase del reloj del dispositivo.
 *
 * Si el envío falla por red, la checada se guarda con la hora del dispositivo
 * corregida con el último desfase conocido respecto al servidor, y se envía
 * después marcada como "diferida". El servidor conserva ambas horas.
 */

export type TipoCaptura = "entrada" | "salida" | "inicio_pausa" | "fin_pausa";

export interface Pendiente {
  idCliente: string;
  trabajadorId: string;
  tipo: TipoCaptura;
  horaDispositivo: string;
  /** Mensaje del servidor si la rechazó de forma definitiva. */
  rechazo?: string;
}

const CLAVE_COLA = "checador:pendientes";
const CLAVE_DESFASE = "checador:desfase-ms";

export async function leerPendientes(): Promise<Pendiente[]> {
  return (await get<Pendiente[]>(CLAVE_COLA)) ?? [];
}

async function guardarPendientes(lista: Pendiente[]) {
  if (lista.length) await set(CLAVE_COLA, lista);
  else await del(CLAVE_COLA);
}

export async function encolar(p: Pendiente) {
  await guardarPendientes([...(await leerPendientes()), p]);
}

export async function descartarRechazados() {
  await guardarPendientes((await leerPendientes()).filter((p) => !p.rechazo));
}

// --- Reloj ---------------------------------------------------------------------

function desfaseMs(): number {
  // En el render del servidor no hay localStorage: la hora local del servidor ya es la de referencia.
  if (typeof localStorage === "undefined") return 0;
  const v = Number(localStorage.getItem(CLAVE_DESFASE));
  return Number.isFinite(v) ? v : 0;
}

/** Hora actual estimada del servidor. */
export function ahoraServidor(): Date {
  return new Date(Date.now() + desfaseMs());
}

/** Actualiza el desfase usando el punto medio de la petición para compensar la latencia. */
export function registrarHoraServidor(horaServidorIso: string, inicioMs: number, finMs: number) {
  const servidor = Date.parse(horaServidorIso);
  if (Number.isNaN(servidor)) return;
  localStorage.setItem(CLAVE_DESFASE, String(Math.round(servidor - (inicioMs + finMs) / 2)));
}

export async function sincronizarReloj() {
  const inicio = Date.now();
  try {
    const r = await fetch("/api/hora", { cache: "no-store" });
    const { horaServidor } = (await r.json()) as { horaServidor: string };
    registrarHoraServidor(horaServidor, inicio, Date.now());
  } catch {
    // Sin conexión: se conserva el último desfase conocido.
  }
}

// --- Envío -----------------------------------------------------------------------

export type ResultadoEnvio =
  | { tipo: "ok" }
  | { tipo: "sin-red" }
  | { tipo: "sesion" }
  | { tipo: "rechazado"; mensaje: string };

export async function enviar(
  datos: Omit<Pendiente, "horaDispositivo" | "rechazo">,
  diferido?: { horaDispositivo: string },
): Promise<ResultadoEnvio> {
  const inicio = Date.now();
  let r: Response;
  try {
    r = await fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...datos, diferido: Boolean(diferido), horaDispositivo: diferido?.horaDispositivo }),
    });
  } catch {
    return { tipo: "sin-red" };
  }
  const cuerpo = (await r.json().catch(() => ({}))) as { horaServidor?: string; error?: string };
  if (cuerpo.horaServidor) registrarHoraServidor(cuerpo.horaServidor, inicio, Date.now());
  if (r.ok) return { tipo: "ok" };
  if (r.status === 401) return { tipo: "sesion" };
  if (r.status >= 500) return { tipo: "sin-red" };
  return { tipo: "rechazado", mensaje: cuerpo.error ?? `Error ${r.status}` };
}

let sincronizando: Promise<number> | null = null;

/** Envía la cola. Devuelve cuántas checadas se enviaron. */
export function sincronizarCola(): Promise<number> {
  sincronizando ??= (async () => {
    let enviadas = 0;
    try {
      const lista = await leerPendientes();
      const restantes: Pendiente[] = [];
      let detener = false;
      for (const p of lista) {
        if (detener || p.rechazo) {
          restantes.push(p);
          continue;
        }
        const { horaDispositivo, rechazo: _r, ...datos } = p;
        const res = await enviar(datos, { horaDispositivo });
        if (res.tipo === "ok") enviadas++;
        else if (res.tipo === "rechazado") restantes.push({ ...p, rechazo: res.mensaje });
        else {
          restantes.push(p);
          detener = true; // sin red o sin sesión: reintentar después, en orden
        }
      }
      // Pudo haberse encolado algo mientras se enviaba.
      const nuevas = (await leerPendientes()).filter((p) => !lista.some((l) => l.idCliente === p.idCliente));
      await guardarPendientes([...restantes, ...nuevas]);
    } finally {
      sincronizando = null;
    }
    return enviadas;
  })();
  return sincronizando;
}
