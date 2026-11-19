"use client";

import { useEffect, useState } from "react";
import { TIPOS_AVISO, type TipoAviso } from "@/lib/avisos";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Estado =
  | "cargando"
  | "sin-configurar" // el servidor no tiene llaves de avisos
  | "no-compatible"
  | "iphone-sin-instalar" // Safari solo entrega avisos a la app agregada a la pantalla de inicio
  | "bloqueado" // la persona negó el permiso
  | "inactivo"
  | "activo";

type Preferencias = Record<TipoAviso, boolean>;

/** Llave pública VAPID (base64url) → bytes, como la pide pushManager.subscribe(). */
function llaveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const binario = atob((base64url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function ActivarAvisos({
  vapidPublica,
  userId,
  preferenciasIniciales,
}: {
  vapidPublica: string | null;
  userId: string;
  preferenciasIniciales: Preferencias;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [prefs, setPrefs] = useState<Preferencias>(preferenciasIniciales);

  // Solo en el navegador: el servidor no conoce el permiso ni el dispositivo.
  useEffect(() => {
    (async () => {
      if (!vapidPublica) return setEstado("sin-configurar");
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const compatible = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!compatible) return setEstado(iphone && !instalada ? "iphone-sin-instalar" : "no-compatible");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const registro = await navigator.serviceWorker.getRegistration("/");
      const actual = await registro?.pushManager.getSubscription();
      setEstado(actual && Notification.permission === "granted" ? "activo" : "inactivo");
    })().catch(() => setEstado("no-compatible"));
  }, [vapidPublica]);

  async function activar() {
    if (!vapidPublica) return;
    setOcupado(true);
    setMensaje(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }
      const registro = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveABytes(vapidPublica) }));
      const res = await fetch("/api/avisos/suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suscripcion: suscripcion.toJSON() }),
      });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !r.ok) {
        await suscripcion.unsubscribe().catch(() => {});
        setMensaje({ tipo: "error", texto: r.error ?? "No se pudo activar. Intenta de nuevo." });
        return;
      }
      setEstado("activo");
      setMensaje({ tipo: "ok", texto: "Listo: recibirás avisos en este teléfono." });
    } catch {
      setMensaje({ tipo: "error", texto: "Este navegador no permitió activar los avisos." });
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setMensaje(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration("/");
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        await fetch("/api/avisos/suscripcion", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        });
        await suscripcion.unsubscribe();
      }
      setEstado("inactivo");
      setMensaje({ tipo: "ok", texto: "Ya no recibirás avisos en este teléfono." });
    } finally {
      setOcupado(false);
    }
  }

  async function cambiar(tipo: TipoAviso, valor: boolean) {
    const nuevas = { ...prefs, [tipo]: valor };
    setPrefs(nuevas);
    const { error } = await crearClienteNavegador()
      .from("preferencias_avisos")
      .upsert({ user_id: userId, ...nuevas, actualizado_en: new Date().toISOString() });
    if (error) {
      setPrefs(prefs);
      setMensaje({ tipo: "error", texto: "No se pudo guardar tu preferencia." });
    }
  }

  return (
    <div className="avisos">
      {estado === "cargando" && <p className="vacio">Revisando este teléfono…</p>}
      {estado === "sin-configurar" && <p className="aviso">Los avisos todavía no están disponibles. Tu empresa no tiene que hacer nada.</p>}
      {estado === "no-compatible" && (
        <p className="aviso">Este navegador no recibe avisos. En Android usa Chrome; en iPhone, Safari con iOS 16.4 o posterior.</p>
      )}
      {estado === "iphone-sin-instalar" && (
        <div className="aviso">
          <p>En iPhone los avisos solo llegan si Checador está en tu pantalla de inicio:</p>
          <ol>
            <li>Abre Checador en Safari.</li>
            <li>Toca el botón de compartir y elige «Agregar a pantalla de inicio».</li>
            <li>Abre Checador desde ese ícono y vuelve a esta página.</li>
          </ol>
        </div>
      )}
      {estado === "bloqueado" && (
        <p className="aviso">
          Bloqueaste los avisos de Checador. Para activarlos, permite las notificaciones de este sitio en la configuración de tu
          navegador o teléfono y vuelve a esta página.
        </p>
      )}
      {estado === "inactivo" && (
        <button className="principal" onClick={activar} disabled={ocupado}>
          {ocupado ? "Activando…" : "Activar avisos en este teléfono"}
        </button>
      )}
      {estado === "activo" && (
        <>
          <p className="estado estado-trabajando">Avisos activados en este teléfono</p>
          <button className="enlace" onClick={desactivar} disabled={ocupado}>
            Desactivar en este teléfono
          </button>
        </>
      )}
      {mensaje && <p className={`mensaje ${mensaje.tipo === "ok" ? "mensaje-ok" : "mensaje-error"}`} role="status">{mensaje.texto}</p>}

      <fieldset className="pregunta avisos-tipos">
        <legend>Qué avisos quieres recibir</legend>
        {TIPOS_AVISO.map((t) => (
          <label key={t.tipo} className="casilla-linea avisos-tipo">
            <input type="checkbox" checked={prefs[t.tipo]} onChange={(e) => cambiar(t.tipo, e.target.checked)} />
            <span>
              <strong>{t.etiqueta}</strong>
              <span className="ayuda">{t.detalle}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="ayuda">
        Los avisos llegan de 9:00 a 20:00 y nunca en tus días de descanso. No muestran tus horas: solo te invitan a abrir
        Checador. Tu empresa no puede mandarte mensajes por aquí.
      </p>
    </div>
  );
}
