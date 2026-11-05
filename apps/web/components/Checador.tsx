"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { aHoraLocal, reconstruirTurnos, type EventoBitacora } from "@checador/jornada";
import {
  ahoraServidor,
  descartarRechazados,
  encolar,
  enviar,
  leerPendientes,
  sincronizarCola,
  sincronizarReloj,
  type Pendiente,
  type TipoCaptura,
} from "@/lib/cola";

export interface TrabajadorCliente {
  id: string;
  nombre: string;
  empresa: string;
  centro: string;
  zonaHoraria: string;
}

const ETIQUETA: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
  correccion: "Corrección del empleador",
  anulacion: "Anulación del empleador",
};

export function Checador({ trabajador, eventos }: { trabajador: TrabajadorCliente; eventos: EventoBitacora[] }) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "aviso" | "error"; texto: string } | null>(null);
  const [puedeSalir, setPuedeSalir] = useState(true);
  const [reloj, setReloj] = useState<string>("");
  const [enLinea, setEnLinea] = useState(true);

  const recargarCola = useCallback(async () => {
    setPendientes((await leerPendientes()).filter((p) => p.trabajadorId === trabajador.id));
  }, [trabajador.id]);

  const sincronizar = useCallback(async () => {
    const n = await sincronizarCola();
    await recargarCola();
    if (n > 0) {
      setMensaje({ tipo: "ok", texto: `Se enviaron ${n} checada(s) guardadas sin conexión.` });
      router.refresh();
    }
  }, [recargarCola, router]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void sincronizarReloj().then(sincronizar);
    const online = () => {
      setEnLinea(true);
      void sincronizar();
    };
    const offline = () => setEnLinea(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const tick = setInterval(() => {
      setReloj(aHoraLocal(ahoraServidor(), trabajador.zonaHoraria).slice(11));
    }, 1000);
    setReloj(aHoraLocal(ahoraServidor(), trabajador.zonaHoraria).slice(11));
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      clearInterval(tick);
    };
  }, [sincronizar, trabajador.zonaHoraria]);

  // Estado combinando lo que ya está en el servidor y lo pendiente de enviar.
  const todos: (EventoBitacora & { pendiente?: boolean; rechazo?: string })[] = useMemo(
    () => [
      ...eventos,
      ...pendientes.map((p) => ({
        id: `p:${p.idCliente}`,
        tipo: p.tipo,
        horaEfectiva: p.horaDispositivo,
        puedeSalir: p.puedeSalir ?? null,
        diferido: true,
        pendiente: true,
        ...(p.rechazo ? { rechazo: p.rechazo } : {}),
      })),
    ],
    [eventos, pendientes],
  );
  const vigentes = useMemo(() => todos.filter((e) => !("rechazo" in e && e.rechazo)), [todos]);
  const { estado, enCurso } = useMemo(
    () => reconstruirTurnos(vigentes, trabajador.zonaHoraria, ahoraServidor()),
    [vigentes, trabajador.zonaHoraria],
  );

  async function checar(tipo: TipoCaptura) {
    if (enviando) return;
    setEnviando(true);
    setMensaje(null);
    const datos = {
      idCliente: crypto.randomUUID(),
      trabajadorId: trabajador.id,
      tipo,
      ...(tipo === "inicio_pausa" ? { puedeSalir } : {}),
    };
    const hora = ahoraServidor().toISOString();
    try {
      const r = await enviar(datos);
      if (r.tipo === "ok") {
        setMensaje({ tipo: "ok", texto: `${ETIQUETA[tipo]} registrada.` });
        router.refresh();
      } else if (r.tipo === "sin-red") {
        await encolar({ ...datos, horaDispositivo: hora });
        await recargarCola();
        setMensaje({
          tipo: "aviso",
          texto: `${ETIQUETA[tipo]} guardada sin conexión. Se enviará automáticamente y quedará marcada como diferida.`,
        });
      } else if (r.tipo === "sesion") {
        await encolar({ ...datos, horaDispositivo: hora });
        router.push("/entrar");
      } else {
        setMensaje({ tipo: "error", texto: r.mensaje });
      }
    } finally {
      setEnviando(false);
    }
  }

  const hoy = aHoraLocal(ahoraServidor(), trabajador.zonaHoraria).slice(0, 10);
  const deHoy = todos
    .filter((e) => aHoraLocal(e.horaEfectiva, trabajador.zonaHoraria).startsWith(hoy))
    .sort((a, b) => Date.parse(b.horaEfectiva) - Date.parse(a.horaEfectiva));
  const rechazados = pendientes.filter((p) => p.rechazo);

  return (
    <section className="checador">
      <p className="quien">
        {trabajador.nombre}
        <span>
          {trabajador.empresa} · {trabajador.centro}
        </span>
      </p>

      <div className="reloj" aria-live="off">
        {reloj || "--:--"}
      </div>

      <p className={`estado estado-${estado}`}>
        {estado === "fuera" && "Fuera de turno"}
        {estado === "trabajando" && `Trabajando desde las ${enCurso?.inicio.slice(11)}`}
        {estado === "en_pausa" && "En pausa"}
      </p>

      {!enLinea && <p className="aviso">Sin conexión: tus checadas se guardarán en este teléfono.</p>}

      <div className="acciones">
        {estado === "fuera" && (
          <button className="principal" disabled={enviando} onClick={() => checar("entrada")}>
            Registrar entrada
          </button>
        )}
        {estado === "trabajando" && (
          <>
            <button className="secundario" disabled={enviando} onClick={() => checar("inicio_pausa")}>
              Iniciar pausa
            </button>
            <label className="casilla">
              <input type="checkbox" checked={puedeSalir} onChange={(e) => setPuedeSalir(e.target.checked)} />
              Puedo salir del lugar durante la pausa
            </label>
            <button className="principal salida" disabled={enviando} onClick={() => checar("salida")}>
              Registrar salida
            </button>
          </>
        )}
        {estado === "en_pausa" && (
          <button className="principal" disabled={enviando} onClick={() => checar("fin_pausa")}>
            Terminar pausa
          </button>
        )}
      </div>

      {mensaje && <p className={`mensaje mensaje-${mensaje.tipo}`}>{mensaje.texto}</p>}

      {rechazados.length > 0 && (
        <div className="mensaje mensaje-error">
          <p>Algunas checadas guardadas sin conexión fueron rechazadas:</p>
          <ul>
            {rechazados.map((p) => (
              <li key={p.idCliente}>
                {ETIQUETA[p.tipo]} {aHoraLocal(p.horaDispositivo, trabajador.zonaHoraria).replace("T", " ")}: {p.rechazo}
              </li>
            ))}
          </ul>
          <p>Avisa a tu empleador para que las capture con su motivo.</p>
          <button className="enlace" onClick={() => descartarRechazados().then(recargarCola)}>
            Entendido, quitar de la lista
          </button>
        </div>
      )}

      <h2>Hoy</h2>
      {deHoy.length === 0 ? (
        <p className="vacio">Sin registros hoy.</p>
      ) : (
        <ul className="lista-eventos">
          {deHoy.map((e) => (
            <li key={String(e.id)}>
              <span className="hora">{aHoraLocal(e.horaEfectiva, trabajador.zonaHoraria).slice(11)}</span>
              <span>{ETIQUETA[e.tipo]}</span>
              {"pendiente" in e && e.pendiente && <span className="etiqueta">pendiente de enviar</span>}
              {!("pendiente" in e) && e.diferido && <span className="etiqueta">sin conexión</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
