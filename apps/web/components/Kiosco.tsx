"use client";

import { Isotipo } from "@/components/Marca";
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
import type { Reconstruccion, ResultadoSemana } from "@checador/jornada";
import { sumarDias } from "@/lib/fechas";
import { TablaSemana } from "./TablaSemana";
import { Teclado } from "./Teclado";

type Paso =
  | { tipo: "numero" }
  | { tipo: "pin" }
  | { tipo: "verificando" }
  | {
      tipo: "acciones";
      nombre: string;
      estado: "fuera" | "trabajando" | "en_pausa";
      desde: string | null;
      acuerdo: AcuerdoPendiente | null;
      semanas: SemanaPorRevisar[];
    }
  | {
      tipo: "semana";
      nombre: string;
      semanas: SemanaPorRevisar[];
      datos: { semana: ResultadoSemana; reconstruccion: Reconstruccion } | null;
      objetando: boolean;
      aviso?: string;
    }
  | { tipo: "acuerdo"; nombre: string; acuerdo: AcuerdoPendiente }
  | { tipo: "acciones-sin-red" }
  | { tipo: "listo"; titulo: string; detalle: string; aviso?: boolean };

const ETIQUETA: Record<TipoCaptura, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
};

interface SemanaPorRevisar {
  lunes: string;
  clase: "sin_respuesta" | "corregida";
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const nombreSemana = (lunes: string) => `del ${fechaCorta(lunes)} al ${fechaCorta(sumarDias(lunes, 6))}`;

interface AcuerdoPendiente {
  id: string;
  version: number;
  contenido: string;
  folio: string;
}

const INACTIVIDAD_MS = 20_000;
const LECTURA_MS = 4 * 60_000; // acuerdo o semana: tiempo para leer con calma
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
  const [comentario, setComentario] = useState("");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reiniciar = useCallback(() => {
    setPaso({ tipo: "numero" });
    setNumero("");
    setPin("");
    setComentario("");
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
    const espera = paso.tipo === "listo" ? CONFIRMACION_MS : paso.tipo === "acuerdo" || paso.tipo === "semana" ? LECTURA_MS : INACTIVIDAD_MS;
    temporizador.current = setTimeout(reiniciar, espera);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [paso, numero, pin, comentario, reiniciar]);

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
      acuerdoPendiente?: AcuerdoPendiente | null;
      semanasPorRevisar?: SemanaPorRevisar[];
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
    setPaso({
      tipo: "acciones",
      nombre: c.nombre ?? "",
      estado: c.estado ?? "fuera",
      desde: c.desde ?? null,
      acuerdo: c.acuerdoPendiente ?? null,
      semanas: c.semanasPorRevisar ?? [],
    });
  }

  /** Muestra la primera semana pendiente de la lista, calculada en el servidor. */
  async function abrirSemana(nombre: string, semanas: SemanaPorRevisar[], aviso?: string) {
    setError(null);
    setComentario("");
    setPaso({ tipo: "semana", nombre, semanas, datos: null, objetando: false, aviso });
    try {
      const r = await fetch("/api/kiosco/semana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, pin, lunes: semanas[0]!.lunes }),
      });
      const c = (await r.json().catch(() => ({}))) as {
        error?: string;
        semana?: ResultadoSemana;
        reconstruccion?: Reconstruccion;
      };
      if (!r.ok || !c.semana || !c.reconstruccion) {
        setError(c.error ?? "No se pudo cargar la semana.");
        reiniciar();
        return;
      }
      setPaso({ tipo: "semana", nombre, semanas, datos: { semana: c.semana, reconstruccion: c.reconstruccion }, objetando: false, aviso });
    } catch {
      setError("Sin conexión: tus semanas solo se pueden revisar con internet.");
      reiniciar();
    }
  }

  async function responderSemana(nombre: string, semanas: SemanaPorRevisar[], respuesta: "conforme" | "objeta") {
    if (enviando) return;
    setEnviando(true);
    const lunes = semanas[0]!.lunes;
    try {
      const r = await fetch("/api/kiosco/conformidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, pin, lunes, respuesta, comentario }),
      });
      const c = (await r.json().catch(() => ({}))) as { error?: string; comprobante?: { cadena_secuencia?: number } };
      if (!r.ok) {
        setError(c.error ?? "No se pudo registrar tu respuesta.");
        reiniciar();
        return;
      }
      const hecho = `${respuesta === "conforme" ? "Confirmaste" : "Objetaste"} la semana ${nombreSemana(lunes)} (registro n.º ${c.comprobante?.cadena_secuencia ?? "—"}).`;
      const restantes = semanas.slice(1);
      setEnviando(false);
      if (restantes.length) {
        await abrirSemana(nombre, restantes, hecho);
        return;
      }
      setPaso({
        tipo: "listo",
        titulo: respuesta === "conforme" ? "Semana confirmada" : "Objeción enviada",
        detalle: `${nombre} · ${nombreSemana(lunes)} · registro n.º ${c.comprobante?.cadena_secuencia ?? "—"}`,
      });
      setNumero("");
      setPin("");
      setComentario("");
    } catch {
      setError("Sin conexión: tu respuesta no se envió. Intenta de nuevo con internet.");
      reiniciar();
    } finally {
      setEnviando(false);
    }
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

  async function firmarAcuerdo(acuerdo: AcuerdoPendiente, nombre: string) {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/kiosco/firmar-acuerdo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, pin, acuerdoId: acuerdo.id, acepto: true }),
      });
      const c = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(c.error ?? "No se pudo registrar la firma.");
        reiniciar();
        return;
      }
      setPaso({ tipo: "listo", titulo: "Acuerdo firmado", detalle: `${nombre} · versión ${acuerdo.version} · folio ${acuerdo.folio}` });
      setNumero("");
      setPin("");
    } catch {
      setError("Sin conexión: el acuerdo solo se puede firmar con internet.");
      reiniciar();
    } finally {
      setEnviando(false);
    }
  }

  const rechazados = pendientes.filter((p) => p.rechazo);
  const porEnviar = pendientes.length - rechazados.length;

  return (
    <main className="kiosco">
      <header className="kiosco-cabecera">
        <Isotipo tamano={26} />
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
            {paso.acuerdo && (
              <button className="secundario" onClick={() => setPaso({ tipo: "acuerdo", nombre: paso.nombre, acuerdo: paso.acuerdo! })}>
                Tienes un acuerdo por firmar
              </button>
            )}
            {paso.semanas.length > 0 && (
              <button className="secundario" onClick={() => abrirSemana(paso.nombre, paso.semanas)}>
                Revisar mis horas ({paso.semanas.length} {paso.semanas.length === 1 ? "semana" : "semanas"})
              </button>
            )}
            <button className="enlace" onClick={reiniciar}>Cancelar</button>
          </div>
        </section>
      )}

      {paso.tipo === "acuerdo" && (
        <section className="kiosco-paso">
          <h1>Acuerdo de registro de jornada</h1>
          <p className="ayuda">Versión {paso.acuerdo.version} · folio {paso.acuerdo.folio}. Léelo con calma.</p>
          <pre className="texto-acuerdo">{paso.acuerdo.contenido}</pre>
          <div className="acciones">
            <button className="principal" disabled={enviando} onClick={() => firmarAcuerdo(paso.acuerdo, paso.nombre)}>
              Leí el acuerdo y lo firmo con mi PIN
            </button>
            <button className="enlace" onClick={reiniciar}>Ahora no</button>
          </div>
        </section>
      )}

      {paso.tipo === "semana" && (
        <section className="kiosco-paso kiosco-semana">
          {paso.aviso && <p className="mensaje mensaje-ok">{paso.aviso}</p>}
          <h1>Semana {nombreSemana(paso.semanas[0]!.lunes)}</h1>
          <p className="ayuda">
            {paso.nombre}
            {paso.semanas.length > 1 && ` · te quedan ${paso.semanas.length} semanas por revisar`}
          </p>
          {paso.semanas[0]!.clase === "corregida" && (
            <p className="aviso">Tu empleador hizo cambios después de tu objeción. Revisa si ahora es correcta.</p>
          )}
          {!paso.datos ? (
            <p className="vacio">Cargando…</p>
          ) : (
            <>
              <TablaSemana lunes={paso.semanas[0]!.lunes} semana={paso.datos.semana} reconstruccion={paso.datos.reconstruccion} />
              {paso.objetando ? (
                <div className="acciones">
                  <label>
                    ¿Qué no es correcto?
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Por ejemplo: el jueves salí a las 18:00, no a las 17:00."
                    />
                  </label>
                  <button className="principal" disabled={enviando || !comentario.trim()}
                    onClick={() => responderSemana(paso.nombre, paso.semanas, "objeta")}>
                    Enviar objeción
                  </button>
                  <button className="enlace" onClick={() => setPaso({ ...paso, objetando: false })}>Volver</button>
                </div>
              ) : (
                <div className="acciones">
                  <button className="principal" disabled={enviando}
                    onClick={() => responderSemana(paso.nombre, paso.semanas, "conforme")}>
                    Mis horas son correctas
                  </button>
                  <button className="secundario" disabled={enviando} onClick={() => setPaso({ ...paso, objetando: true })}>
                    Algo no es correcto
                  </button>
                  <p className="ayuda">Tu respuesta queda firmada con tu PIN. Es voluntaria: si no respondes, no se considera que estés de acuerdo.</p>
                  <button className="enlace" onClick={reiniciar}>Ahora no</button>
                </div>
              )}
            </>
          )}
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
