"use client";

import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { registrarPasskey } from "@/lib/passkeysCliente";
import { crearClienteNavegador } from "@/lib/supabase/client";

export interface PasskeyFila {
  id: string;
  nombre: string;
  creadaEn: string;
  usadaEn: string | null;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** Huella o rostro: los teléfonos registrados y el botón para agregar este. */
export function HuellaAcceso({ passkeys }: { passkeys: PasskeyFila[] }) {
  const router = useRouter();
  const [soportado, setSoportado] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  useEffect(() => setSoportado(browserSupportsWebAuthn()), []);

  async function agregar() {
    setOcupado(true);
    setEstado(null);
    const r = await registrarPasskey();
    setOcupado(false);
    setEstado(r.ok ? { tipo: "ok", texto: "Listo: ya puedes elegir volver a entrar con tu huella o rostro." } : { tipo: "error", texto: r.error });
    if (r.ok) router.refresh();
  }

  async function quitar(p: PasskeyFila) {
    if (!confirm(`¿Quitar "${p.nombre}"? Ese teléfono ya no podrá entrar con huella o rostro.`)) return;
    setOcupado(true);
    const { error } = await crearClienteNavegador().rpc("borrar_passkey", { p_id: p.id });
    setOcupado(false);
    setEstado(error ? { tipo: "error", texto: error.message } : null);
    router.refresh();
  }

  return (
    <div className="huella-acceso">
      <p>
        Usa la huella, el rostro o el bloqueo de pantalla que tu teléfono ya tiene. Tu huella nunca sale del teléfono:
        Checador solo guarda una llave para reconocerlo.
      </p>
      {passkeys.length > 0 && (
        <ul className="lista-passkeys">
          {passkeys.map((p) => (
            <li key={p.id}>
              <span>
                <strong>{p.nombre}</strong>
                <small>
                  Registrado el {fecha(p.creadaEn)}
                  {p.usadaEn ? ` · último uso ${fecha(p.usadaEn)}` : ""}
                </small>
              </span>
              <button type="button" className="enlace" disabled={ocupado} onClick={() => quitar(p)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {soportado === false ? (
        <p className="mensaje mensaje-aviso">Este navegador no permite usar la huella o el rostro. Usa tu PIN.</p>
      ) : (
        <button type="button" className="secundario" disabled={ocupado || soportado === null} onClick={agregar}>
          {ocupado ? "Esperando al teléfono…" : "Agregar la huella o el rostro de este teléfono"}
        </button>
      )}
      {estado && <p className={`mensaje mensaje-${estado.tipo}`}>{estado.texto}</p>}
    </div>
  );
}
