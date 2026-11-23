"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CLAVE = "checador:sugerencia-acceso:cerrada";

/** Invita a elegir el PIN para no esperar el código del correo cada vez que se sale. */
export function SugerenciaAcceso() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(localStorage.getItem(CLAVE) !== "1"), []);
  if (!visible) return null;
  return (
    <p className="mensaje sugerencia-acceso">
      <span>
        ¿No quieres esperar el código del correo cada vez que sales? <Link href="/acceso">Vuelve a entrar con tu PIN</Link>.
      </span>
      <button type="button" className="enlace" aria-label="No volver a mostrar"
        onClick={() => { localStorage.setItem(CLAVE, "1"); setVisible(false); }}>
        ✕
      </button>
    </p>
  );
}
