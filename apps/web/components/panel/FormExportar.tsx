"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FORMATOS = [
  { valor: "pdf", etiqueta: "PDF: constancia para inspección o juicio (por trabajador)" },
  { valor: "csv_bitacora", etiqueta: "CSV: bitácora completa (cada registro)" },
  { valor: "csv_resumen", etiqueta: "CSV: resumen por día y semana (horas y extras)" },
];

export function FormExportar({
  trabajadores,
  inicial,
  desde,
  hasta,
}: {
  trabajadores: { id: string; nombre: string; baja: boolean }[];
  inicial: string;
  desde: string;
  hasta: string;
}) {
  const router = useRouter();
  const [trabajador, setTrabajador] = useState(inicial);
  const [formato, setFormato] = useState("pdf");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [generando, setGenerando] = useState(false);

  async function exportar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setGenerando(true);
    setEstado(null);
    try {
      const r = await fetch(`/api/exportar?${new URLSearchParams(fd as unknown as Record<string, string>)}`);
      if (!r.ok) {
        const c = (await r.json().catch(() => ({}))) as { error?: string };
        setEstado({ ok: false, texto: c.error ?? "No se pudo exportar." });
        return;
      }
      const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "checador";
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setEstado({ ok: true, texto: `Descargado ${nombre}. Huella SHA-256: ${r.headers.get("X-Checador-Sha256")}` });
      router.refresh();
    } catch {
      setEstado({ ok: false, texto: "Sin conexión." });
    } finally {
      setGenerando(false);
    }
  }

  const todos = trabajador === "todos";
  return (
    <form className="form-panel" onSubmit={exportar}>
      <div className="campos">
        <label>
          Trabajador
          <select name="trabajador" value={trabajador} onChange={(e) => {
            setTrabajador(e.target.value);
            if (e.target.value === "todos" && formato === "pdf") setFormato("csv_bitacora");
          }}>
            <option value="todos">Todos (solo CSV)</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}{t.baja ? " (baja)" : ""}</option>
            ))}
          </select>
        </label>
        <label>Desde<input type="date" name="desde" required defaultValue={desde} /></label>
        <label>Hasta<input type="date" name="hasta" required defaultValue={hasta} /></label>
        <label>
          Formato
          <select name="formato" value={formato} onChange={(e) => setFormato(e.target.value)}>
            {FORMATOS.filter((f) => !(todos && f.valor === "pdf")).map((f) => (
              <option key={f.valor} value={f.valor}>{f.etiqueta}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="ayuda">El periodo se ajusta a semanas completas (lunes a domingo), porque el tiempo extra se calcula por semana.</p>
      <button className="boton" disabled={generando}>{generando ? "Generando…" : "Exportar"}</button>
      {estado && <p className={`mensaje ${estado.ok ? "mensaje-ok" : "mensaje-error"} comprobante`} role="status">{estado.texto}</p>}
    </form>
  );
}
