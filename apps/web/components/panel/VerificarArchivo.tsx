"use client";

import { useState } from "react";
import { buscarExportacion, type ResultadoVerificacion } from "@/app/panel/acciones";

/** Calcula la huella SHA-256 del archivo en el navegador (el archivo no se sube) y la busca en el registro. */
export function VerificarArchivo() {
  const [resultado, setResultado] = useState<ResultadoVerificacion | null>(null);
  const [huella, setHuella] = useState<string | null>(null);

  async function revisar(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    setResultado(null);
    if (!archivo) return;
    const digest = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    setHuella(hex);
    setResultado(await buscarExportacion(hex));
  }

  return (
    <div className="form-panel">
      <label>
        Archivo a verificar (PDF o CSV emitido por Checador)
        <input type="file" accept=".pdf,.csv" onChange={revisar} />
      </label>
      {huella && <p className="ayuda comprobante">Huella SHA-256: {huella}</p>}
      {resultado && (
        <p className={`mensaje ${resultado.encontrado ? "mensaje-ok" : "mensaje-error"}`} role="status">{resultado.mensaje}</p>
      )}
    </div>
  );
}
