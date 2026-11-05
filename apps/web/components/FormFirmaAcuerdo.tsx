"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FormFirmaAcuerdo({ acuerdoId, folio }: { acuerdoId: string; folio: string }) {
  const router = useRouter();
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function firmar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/acuerdos/firmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acuerdoId, acepto }),
      });
      const c = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setError(c.error ?? "No se pudo registrar tu firma.");
      else router.refresh();
    } catch {
      setError("Sin conexión. Firma cuando tengas internet.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta">
      <label className="casilla-linea">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        Leí el acuerdo completo (folio {folio}) y estoy de acuerdo
      </label>
      <button className="principal" disabled={!acepto || enviando} onClick={firmar}>
        {enviando ? "Firmando…" : "Firmar acuerdo"}
      </button>
      <p className="ayuda">
        No estás obligado a firmar en este momento. Si algo no es correcto, coméntalo con tu empleador antes de firmar.
      </p>
      {error && <p className="mensaje mensaje-error">{error}</p>}
    </div>
  );
}
