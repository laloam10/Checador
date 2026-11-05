"use client";

import { useState } from "react";
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

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await crearClienteNavegador().auth.signInWithOtp({
      email: correo.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setCargando(false);
    if (error) setError("No se pudo enviar el código. Revisa el correo e intenta de nuevo.");
    else setPaso("codigo");
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
      setError("Código incorrecto o vencido.");
      return;
    }
    await supabase.rpc("vincular_mi_cuenta");
    const siguiente = new URLSearchParams(window.location.search).get("siguiente");
    // Solo rutas internas (evita redirecciones abiertas a otros sitios).
    window.location.href = siguiente && /^\/(?![/\\])/.test(siguiente) ? siguiente : "/";
  }

  return (
    <main className="entrar">
      <h1>Checador</h1>
      <p className="subtitulo">Registro de jornada</p>

      {paso === "correo" ? (
        <form onSubmit={pedirCodigo} className="tarjeta">
          <label>
            Tu correo
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
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
          <p>
            Enviamos un código a <strong>{correo}</strong>.
          </p>
          <label>
            Código
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </label>
          <button className="principal" disabled={cargando}>
            {cargando ? "Verificando…" : "Entrar"}
          </button>
          <button type="button" className="enlace" onClick={() => setPaso("correo")}>
            Usar otro correo
          </button>
        </form>
      )}

      {error && <p className="mensaje mensaje-error">{error}</p>}

      <p className="legal">
        Tus registros de jornada se conservan conforme a la Ley Federal del Trabajo. Consulta el aviso de privacidad
        de tu empleador.
      </p>
    </main>
  );
}
