"use client";

import { useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";

export function FormPin({ trabajadorId }: { trabajadorId: string }) {
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== confirmacion) {
      setEstado({ tipo: "error", texto: "Los PIN no coinciden." });
      return;
    }
    setEnviando(true);
    const { error } = await crearClienteNavegador().rpc("establecer_mi_pin", { p_trabajador: trabajadorId, p_pin: pin });
    setEnviando(false);
    if (error) {
      setEstado({ tipo: "error", texto: error.message });
    } else {
      setEstado({ tipo: "ok", texto: "PIN guardado." });
      setPin("");
      setConfirmacion("");
    }
  }

  return (
    <form onSubmit={guardar} className="tarjeta">
      <label>
        Nuevo PIN (4 a 6 dígitos)
        <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" required
          value={pin} onChange={(e) => setPin(e.target.value)} />
      </label>
      <label>
        Confirma el PIN
        <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" required
          value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
      </label>
      <button className="principal" disabled={enviando}>{enviando ? "Guardando…" : "Guardar PIN"}</button>
      {estado && <p className={`mensaje mensaje-${estado.tipo}`}>{estado.texto}</p>}
    </form>
  );
}
