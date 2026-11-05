"use client";

import { del, get, set } from "idb-keyval";
import { registrarHoraServidor, type TipoCaptura } from "./cola";

/**
 * Cola sin conexión del kiosco.
 *
 * RIESGO CONOCIDO: para verificar el PIN al reconectar, la checada pendiente
 * guarda número y PIN en IndexedDB de este dispositivo. Se borran en cuanto se
 * envían. Quien tenga acceso al dispositivo y a sus herramientas de desarrollo
 * podría leer PINs de checadas pendientes. Mitigación: mantener el kiosco en
 * modo de app fija (pantalla anclada) y con conexión estable.
 */

export interface PendienteKiosco {
  idCliente: string;
  numero: string;
  pin: string;
  tipo: TipoCaptura;
  horaDispositivo: string;
  rechazo?: string;
}

const CLAVE = "checador:kiosco:pendientes";

export async function leerPendientesKiosco(): Promise<PendienteKiosco[]> {
  return (await get<PendienteKiosco[]>(CLAVE)) ?? [];
}

async function guardar(lista: PendienteKiosco[]) {
  if (lista.length) await set(CLAVE, lista);
  else await del(CLAVE);
}

export async function encolarKiosco(p: PendienteKiosco) {
  await guardar([...(await leerPendientesKiosco()), p]);
}

export async function descartarRechazadosKiosco() {
  await guardar((await leerPendientesKiosco()).filter((p) => !p.rechazo));
}

export type ResultadoKiosco =
  | { tipo: "ok"; nombre: string; horaEfectiva: string | null }
  | { tipo: "sin-red" }
  | { tipo: "sesion" }
  | { tipo: "reintentar"; mensaje: string }
  | { tipo: "rechazado"; mensaje: string };

export async function enviarKiosco(
  datos: Omit<PendienteKiosco, "horaDispositivo" | "rechazo">,
  diferido?: { horaDispositivo: string },
): Promise<ResultadoKiosco> {
  const inicio = Date.now();
  let r: Response;
  try {
    r = await fetch("/api/kiosco/checar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...datos, diferido: Boolean(diferido), horaDispositivo: diferido?.horaDispositivo }),
    });
  } catch {
    return { tipo: "sin-red" };
  }
  const c = (await r.json().catch(() => ({}))) as {
    nombre?: string;
    horaEfectiva?: string | null;
    horaServidor?: string;
    error?: string;
  };
  if (c.horaServidor) registrarHoraServidor(c.horaServidor, inicio, Date.now());
  if (r.ok) return { tipo: "ok", nombre: c.nombre ?? "", horaEfectiva: c.horaEfectiva ?? null };
  if (r.status === 401) return { tipo: "sesion" };
  if (r.status === 429) return { tipo: "reintentar", mensaje: c.error ?? "Bloqueado temporalmente." };
  if (r.status >= 500) return { tipo: "sin-red" };
  return { tipo: "rechazado", mensaje: c.error ?? `Error ${r.status}` };
}

let enCurso: Promise<number> | null = null;

/** Envía la cola en orden. Devuelve cuántas se registraron. */
export function sincronizarColaKiosco(): Promise<number> {
  enCurso ??= (async () => {
    let enviadas = 0;
    try {
      const lista = await leerPendientesKiosco();
      const restantes: PendienteKiosco[] = [];
      let detener = false;
      for (const p of lista) {
        if (detener || p.rechazo) {
          restantes.push(p);
          continue;
        }
        const { horaDispositivo, rechazo: _r, ...datos } = p;
        const res = await enviarKiosco(datos, { horaDispositivo });
        if (res.tipo === "ok") enviadas++;
        // Al rechazarse se borra el PIN: ya no hace falta conservarlo.
        else if (res.tipo === "rechazado") restantes.push({ ...p, pin: "", rechazo: res.mensaje });
        else {
          restantes.push(p);
          detener = res.tipo !== "reintentar";
        }
      }
      const nuevas = (await leerPendientesKiosco()).filter((p) => !lista.some((l) => l.idCliente === p.idCliente));
      await guardar([...restantes, ...nuevas]);
    } finally {
      enCurso = null;
    }
    return enviadas;
  })();
  return enCurso;
}
