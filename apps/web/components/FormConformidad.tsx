"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FormConformidad({ trabajadorId, semana }: { trabajadorId: string; semana: string }) {
  const router = useRouter();
  const [objetar, setObjetar] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function responder(respuesta: "conforme" | "objeta") {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/conformidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trabajadorId, semana, respuesta, comentario }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(cuerpo.error ?? "No se pudo registrar tu respuesta.");
      } else {
        setObjetar(false);
        setComentario("");
        router.refresh();
      }
    } catch {
      setError("Sin conexión. Intenta cuando tengas internet.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta">
      <p>
        Revisa tus horarios de esta semana. Si son correctos, confirma. Si algo no coincide, objétalo y explica qué
        está mal: tu empleador deberá corregirlo y podrás revisarlo de nuevo.
      </p>
      {!objetar ? (
        <div className="acciones">
          <button className="principal" disabled={enviando} onClick={() => responder("conforme")}>
            Estoy de acuerdo con mis registros
          </button>
          <button className="secundario" disabled={enviando} onClick={() => setObjetar(true)}>
            Algo no es correcto
          </button>
        </div>
      ) : (
        <>
          <label>
            ¿Qué no es correcto?
            <textarea
              rows={3}
              maxLength={2000}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej.: el martes salí a las 18:00, no a las 17:00"
            />
          </label>
          <div className="acciones">
            <button
              className="principal"
              disabled={enviando || !comentario.trim()}
              onClick={() => responder("objeta")}
            >
              Enviar objeción
            </button>
            <button className="enlace" onClick={() => setObjetar(false)}>
              Cancelar
            </button>
          </div>
        </>
      )}
      {error && <p className="mensaje mensaje-error">{error}</p>}
    </div>
  );
}
