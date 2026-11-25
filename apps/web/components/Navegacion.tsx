"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Isotipo } from "@/components/Marca";
import { salirDeLaApp } from "@/lib/salir";

// Secciones de la persona trabajadora. Íconos de trazo (24×24), como en el panel.
const SECCIONES = [
  { href: "/", etiqueta: "Checar", corta: "Checar", exacto: true, icono: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { href: "/registros", etiqueta: "Mis registros", corta: "Registros", icono: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
  { href: "/acuerdo", etiqueta: "Acuerdo", corta: "Acuerdo", icono: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" },
  { href: "/acceso", etiqueta: "Acceso", corta: "Acceso", icono: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2" },
  { href: "/avisos", etiqueta: "Avisos", corta: "Avisos", icono: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },
];

export function Navegacion({ panel = false }: { panel?: boolean }) {
  const ruta = usePathname();
  const activo = (s: (typeof SECCIONES)[number]) => (s.exacto ? ruta === s.href : ruta.startsWith(s.href));

  return (
    <>
      <header className="app-cabecera">
        <Link href="/" className="marca-enlace app-marca" aria-label="Checador: inicio">
          <Isotipo tamano={30} />
          <span>checador</span>
        </Link>
        <nav className="app-secciones" aria-label="Secciones">
          {SECCIONES.map((s) => (
            <Link key={s.href} href={s.href} className={activo(s) ? "activo" : ""} aria-current={activo(s) ? "page" : undefined}>
              {s.etiqueta}
            </Link>
          ))}
        </nav>
        <div className="app-cabecera-acciones">
          {panel && <Link href="/panel" className="chip-panel">Panel</Link>}
          <button className="enlace" onClick={salirDeLaApp}>Salir</button>
        </div>
      </header>

      {/* En el celular: abajo, al alcance del pulgar. */}
      <nav className="barra-inferior barra-trabajador" aria-label="Secciones">
        {SECCIONES.map((s) => (
          <Link key={s.href} href={s.href} className={activo(s) ? "activo" : ""} aria-current={activo(s) ? "page" : undefined}>
            <span className="barra-icono">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
                <path d={s.icono} />
              </svg>
            </span>
            {s.corta}
          </Link>
        ))}
      </nav>
    </>
  );
}
