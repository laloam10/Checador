"use client";

import { Marca } from "@/components/Marca";
import { useEffect, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Entrada con código de un solo uso enviado por correo (sin contraseña).
 * Se usa código y no enlace mágico porque, en una PWA instalada, el enlace
 * se abre en el navegador y no en la app.
 */
export default function Entrar() {
  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0); // segundos para poder reenviar el código
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function reenviar() {
    setError(null);
    setReenviado(false);
    const { error } = await crearClienteNavegador().auth.signInWithOtp({
      email: correo.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error?.status === 429) setError("Se pidieron demasiados códigos. Espera unos minutos y vuelve a intentarlo.");
    else if (error) setError("No se pudo reenviar el código. Intenta de nuevo.");
    else {
      setReenviado(true);
      setEspera(30);
    }
  }

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await crearClienteNavegador().auth.signInWithOtp({
      email: correo.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setCargando(false);
    if (error?.status === 429) setError("Se pidieron demasiados códigos. Espera unos minutos y vuelve a intentarlo.");
    else if (error) setError("No se pudo enviar el código. Revisa el correo e intenta de nuevo.");
    else {
      setPaso("codigo");
      setEspera(30);
    }
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.auth.verifyOtp({
      email: correo.trim().toLowerCase(),
      token: codigo.trim(),
      type: "email",
    });
    if (error) {
      setCargando(false);
      setError(error.status === 429 ? "Demasiados intentos. Espera unos minutos." : "Código incorrecto o vencido.");
      return;
    }
    await supabase.rpc("vincular_mi_cuenta");
    const siguiente = new URLSearchParams(window.location.search).get("siguiente");
    // Solo rutas internas (evita redirecciones abiertas a otros sitios).
    window.location.href = siguiente && /^\/(?![/\\])/.test(siguiente) ? siguiente : "/";
  }

  return (
    <main className="entrar">
      <aside className="entrar-marca">
        <Marca tamano={48} subtitulo="Registro de jornada" />
        <div className="entrar-lema">
          <h2>Tu jornada, registrada con claridad.</h2>
          <ul>
            <li>Checa en segundos desde tu celular, el kiosco o WhatsApp.</li>
            <li>Consulta tus horas y tu tiempo extra cuando quieras.</li>
            <li>Nada se borra: cada registro queda protegido y se puede verificar.</li>
          </ul>
        </div>
        <p className="entrar-pie">Registro electrónico conforme al art. 132, fracción XXXIV, de la Ley Federal del Trabajo.</p>
      </aside>

      <section className="entrar-formulario">
        <div className="entrar-marca-chica"><Marca tamano={40} subtitulo="Registro de jornada" /></div>
        <h1 className="entrar-titulo">{paso === "correo" ? "Entra con tu correo" : "Revisa tu correo"}</h1>
        <p className="subtitulo">
          {paso === "correo" ? "Te enviaremos un código; no necesitas contraseña." : <>Enviamos un código a <strong>{correo}</strong>.</>}
        </p>

        {paso === "correo" ? (
          <form onSubmit={pedirCodigo} className="tarjeta">
            <label>
              Tu correo
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="nombre@empresa.mx"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </label>
            <button className="principal" disabled={cargando}>
              {cargando ? "Enviando…" : "Enviarme un código"}
            </button>
          </form>
        ) : (
          <form onSubmit={verificar} className="tarjeta">
            <label>
              Código
              <input
                className="campo-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                required
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button className="principal" disabled={cargando}>
              {cargando ? "Verificando…" : "Entrar"}
            </button>
            <div className="entrar-acciones">
              <button type="button" className="enlace" disabled={espera > 0} onClick={reenviar}>
                {espera > 0 ? `Reenviar código en ${espera} s` : "Reenviar código"}
              </button>
              <button type="button" className="enlace" onClick={() => { setPaso("correo"); setCodigo(""); setReenviado(false); }}>
                Usar otro correo
              </button>
            </div>
            {reenviado && <p className="mensaje mensaje-ok">Te enviamos un código nuevo. El anterior ya no sirve.</p>}
            <p className="ayuda">Vence en 15 minutos. Si no llega, revisa la carpeta de spam o promociones.</p>
          </form>
        )}

        {error && <p className="mensaje mensaje-error">{error}</p>}

        <p className="entrar-empresa">
          ¿Tienes un negocio? <a href="/alta-empresa">Registra tu empresa</a> y lleva el registro de jornada de tu personal.
        </p>
        <p className="legal">
          Tus registros de jornada se conservan conforme a la Ley Federal del Trabajo. Consulta el aviso de privacidad
          de tu empleador.
        </p>
      </section>
    </main>
  );
}
