"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aHoraLocal } from "@checador/jornada";
import { ahoraServidor, registrarHoraServidor, sincronizarReloj, type TipoCaptura } from "@/lib/cola";
import {
  descartarRechazadosKiosco,
  encolarKiosco,
  enviarKiosco,
  leerPendientesKiosco,
  sincronizarColaKiosco,
  type PendienteKiosco,
} from "@/lib/colaKiosco";
import { Teclado } from "./Teclado";

type Paso =
  | { tipo: "numero" }
  | { tipo: "pin" }
  | { tipo: "verificando" }
  | { tipo: "acciones"; nombre: string; estado: "fuera" | "trabajando" | "en_pausa"; desde: string | null }
  | { tipo: "acciones-sin-red" }
  | { tipo: "listo"; titulo: string; detalle: string; aviso?: boolean };

const ETIQUETA: Record<TipoCaptura, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
};

const INACTIVIDAD_MS = 20_000;
const CONFIRMACION_MS = 4_000;

export function Kiosco({ empresa, centro, zonaHoraria }: { empresa: string; centro: string | null; zonaHoraria: string }) {
  const [paso, setPaso] = useState<Paso>({ tipo: "numero" });
  const [numero, setNumero] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloj, setReloj] = useState("");
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState<PendienteKiosco[]>([]);
  const [enviando, setEnviando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reiniciar = useCallback(() => {
    setPaso({ tipo: "numero" });
    setNumero("");
    setPin("");
    setEnviando(false);
  }, []);

  const recargarCola = useCallback(async () => setPendientes(await leerPendientesKiosco()), []);

  const sincronizar = useCallback(async () => {
    await sincronizarColaKiosco();
    await recargarCola();
  }, [recargarCola]);

  // Reloj, red, sincronización periódica y pantalla siempre encendida.
  useEffect(() => {
    setEnLinea(navigator.onLine);
    void sincronizarReloj().then(sincronizar);
    const actualizarReloj = () => setReloj(aHoraLocal(ahoraServidor(), zonaHoraria).slice(11));
    actualizarReloj();
    const tick = setInterval(actualizarReloj, 1000);
    const periodico = setInterval(() => navigator.onLine && void sincronizar(), 60_000);
    const online = () => {
      setEnLinea(true);
      void sincronizar();
    };
    const offline = () => setEnLinea(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    let bloqueo: WakeLockSentinel | null = null;
    const pedirPantalla = () =>
      navigator.wakeLock?.request("screen").then((b) => (bloqueo = b)).catch(() => {});
    void pedirPantalla();
    const visible = () => document.visibilityState === "visible" && void pedirPantalla();
    document.addEventListener("visibilitychange", visible);

    return () => {
      clearInterval(tick);
      clearInterval(periodico);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      void bloqueo?.release();
    };
  }, [sincronizar, zonaHoraria]);

  // Vuelve al inicio por inactividad (nadie debe ver el paso de otra persona).
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    if (paso.tipo === "numero" && !numero) return;
    const espera = paso.tipo === "listo" ? CONFIRMACION_MS : INACTIVIDAD_MS;
    temporizador.current = setTimeout(reiniciar, espera);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [paso, numero, pin, reiniciar]);

  async function identificar() {
    setError(null);
    setPaso({ tipo: "verificando" });
    const inicio = Date.now();
    let r: Response;
    try {
      r = await fetch("/api/kiosco/identificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, pin }),
      });
    } catch {
      // Sin conexión: no se puede verificar ahora; se ofrecen todas las acciones y se verifica al reconectar.
      setPaso({ tipo: "acciones-sin-red" });
      return;
    }
    const c = (await r.json().catch(() => ({}))) as {
      nombre?: string;
      estado?: "fuera" | "trabajando" | "en_pausa";
      desde?: string | null;
      error?: string;
      horaServidor?: string;
    };
    if (c.horaServidor) registrarHoraServidor(c.horaServidor, inicio, Date.now());
    if (r.status === 401) {
      window.location.href = "/entrar?siguiente=/kiosco";
      return;
    }
    if (!r.ok) {
      setError(c.error ?? "No se pudo verificar.");
      setNumero("");
      setPin("");
      setPaso({ tipo: "numero" });
      return;
    }
    setPaso({ tipo: "acciones", nombre: c.nombre ?? "", estado: c.estado ?? "fuera", desde: c.desde ?? null });
  }

  async function checar(tipo: TipoCaptura) {
    if (enviando) return;
    setEnviando(true);
    const datos = { idCliente: crypto.randomUUID(), numero, pin, tipo };
    const hora = ahoraServidor();
    const r = await enviarKiosco(datos);
    if (r.tipo === "ok") {
      const h = r.horaEfectiva ? aHoraLocal(r.horaEfectiva, zonaHoraria).slice(11) : aHoraLocal(hora, zonaHoraria).slice(11);
      setPaso({ tipo: "listo", titulo: `${ETIQUETA[tipo]} registrada`, detalle: `${r.nombre} · ${h}` });
    } else if (r.tipo === "sin-red" || r.tipo === "sesion") {
      await encolarKiosco({ ...datos, horaDispositivo: hora.toISOString() });
      await recargarCola();
      setPaso({
        tipo: "listo",
        titulo: `${ETIQUETA[tipo]} guardada sin conexión`,
        detalle: `${aHoraLocal(hora, zonaHoraria).slice(11)} · se enviará al volver la conexión`,
        aviso: true,
      });
      if (r.tipo === "sesion") window.location.href = "/entrar?siguiente=/kiosco";
    } else {
      setError(r.mensaje);
      reiniciar();
      return;
    }
    setNumero("");
    setPin("");
    setEnviando(false);
  }

  const rechazados = pendientes.filter((p) => p.rechazo);
  const porEnviar = pendientes.length - rechazados.length;

  return (
    <main className="kiosco">
      <header className="kiosco-cabecera">
        <span>
          {empresa}
          {centro ? ` · ${centro}` : ""}
        </span>
        {!enLinea && <span className="etiqueta">sin conexión</span>}
      </header>

      <div className="reloj">{reloj || "--:--:--"}</div>

      {error && <p className="mensaje mensaje-error">{error}</p>}

      {paso.tipo === "numero" && (
        <section className="kiosco-paso">
          <h1>Número de empleado</h1>
          <output className="pantalla-numero" aria-label="Número capturado">{numero || " "}</output>
          <Teclado valor={numero} max={10} min={1} onCambio={(v) => { setError(null); setNumero(v); }}
            onOk={() => setPaso({ tipo: "pin" })} />
        </section>
      )}

      {(paso.tipo === "pin" || paso.tipo === "verificando") && (
        <section className="kiosco-paso">
          <h1>PIN</h1>
          <output className="pantalla-numero" aria-label="PIN capturado">{"•".repeat(pin.length) || " "}</output>
          <Teclado valor={pin} max={6} min={4} onCambio={setPin} onOk={identificar}
            deshabilitado={paso.tipo === "verificando"} />
          <button className="enlace" onClick={reiniciar}>Cancelar</button>
        </section>
      )}

      {paso.tipo === "acciones" && (
        <section className="kiosco-paso">
          <h1>Hola, {paso.nombre.split(" ")[0]}</h1>
          <p className="estado">
            {paso.estado === "fuera" && "Fuera de turno"}
            {paso.estado === "trabajando" && `Trabajando desde las ${paso.desde}`}
            {paso.estado === "en_pausa" && "En pausa"}
          </p>
          <div className="acciones">
            {paso.estado === "fuera" && (
              <button className="principal" disabled={enviando} onClick={() => checar("entrada")}>Registrar entrada</button>
            )}
            {paso.estado === "trabajando" && (
              <>
                <button className="secundario" disabled={enviando} onClick={() => checar("inicio_pausa")}>Iniciar pausa</button>
                <button className="principal salida" disabled={enviando} onClick={() => checar("salida")}>Registrar salida</button>
              </>
            )}
            {paso.estado === "en_pausa" && (
              <button className="principal" disabled={enviando} onClick={() => checar("fin_pausa")}>Terminar pausa</button>
            )}
            <button className="enlace" onClick={reiniciar}>Cancelar</button>
          </div>
        </section>
      )}

      {paso.tipo === "acciones-sin-red" && (
        <section className="kiosco-paso">
          <h1>Sin conexión</h1>
          <p className="aviso">Tu PIN se verificará cuando vuelva la conexión. Elige lo que vas a registrar:</p>
          <div className="acciones acciones-2">
            {(Object.keys(ETIQUETA) as TipoCaptura[]).map((t) => (
              <button key={t} className={t === "entrada" ? "principal" : "secundario"} disabled={enviando} onClick={() => checar(t)}>
                {ETIQUETA[t]}
              </button>
            ))}
          </div>
          <button className="enlace" onClick={reiniciar}>Cancelar</button>
        </section>
      )}

      {paso.tipo === "listo" && (
        <section className={`kiosco-paso kiosco-listo ${paso.aviso ? "listo-aviso" : ""}`} role="status">
          <div className="palomita" aria-hidden>{paso.aviso ? "⏳" : "✓"}</div>
          <h1>{paso.titulo}</h1>
          <p>{paso.detalle}</p>
        </section>
      )}

      <footer className="kiosco-pie">
        {porEnviar > 0 && <span>{porEnviar} checada(s) pendientes de enviar</span>}
        {rechazados.length > 0 && (
          <details>
            <summary>{rechazados.length} checada(s) sin conexión rechazadas</summary>
            <ul>
              {rechazados.map((p) => (
                <li key={p.idCliente}>
                  N.º {p.numero} · {ETIQUETA[p.tipo]} {aHoraLocal(p.horaDispositivo, zonaHoraria).replace("T", " ")}: {p.rechazo}
                </li>
              ))}
            </ul>
            <p>El supervisor debe capturarlas desde el panel con su motivo.</p>
            <button className="enlace" onClick={() => descartarRechazadosKiosco().then(recargarCola)}>Quitar de la lista</button>
          </details>
        )}
      </footer>
    </main>
  );
}
