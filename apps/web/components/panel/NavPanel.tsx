"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Marca } from "@/components/Marca";

const ENLACES = [
  { href: "/panel", etiqueta: "Tablero", exacto: true },
  { href: "/panel/trabajadores", etiqueta: "Trabajadores" },
  { href: "/panel/objeciones", etiqueta: "Objeciones" },
  { href: "/panel/exportar", etiqueta: "Exportar" },
  { href: "/panel/centros", etiqueta: "Centros" },
  { href: "/panel/accesos", etiqueta: "Accesos" },
];

async function salir() {
  if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  await fetch("/api/salir", { method: "POST" });
  window.location.href = "/entrar";
}

export function CabeceraPanel({ empresa, rol }: { empresa: string; rol: string }) {
  return (
    <header className="panel-cabecera">
      <Link href="/panel" className="marca-enlace" aria-label="Checador, inicio del panel">
        <Marca tamano={34} subtitulo="Panel del empleador" />
      </Link>
      <div className="panel-cuenta">
        <div className="panel-empresa">
          <strong title={empresa}>{empresa}</strong>
          <span>{rol}</span>
        </div>
        <button className="boton-chico" onClick={salir}>Salir</button>
      </div>
    </header>
  );
}

// Íconos de la barra inferior (trazo, 24×24).
const ICONOS: Record<string, string> = {
  "/panel": "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  "/panel/trabajadores": "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  "/panel/objeciones": "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v4M12 14h.01",
  mas: "M4 6h16M4 12h16M4 18h16",
};

function Icono({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={d} />
    </svg>
  );
}

const PRINCIPALES = ENLACES.slice(0, 3);
const SECUNDARIOS = ENLACES.slice(3);
const esActivo = (ruta: string, e: (typeof ENLACES)[number]) => (e.exacto ? ruta === e.href : ruta.startsWith(e.href));

/** Navegación del panel en el celular: fija abajo, al alcance del pulgar. */
function BarraInferior({ objeciones }: { objeciones: number }) {
  const ruta = usePathname();
  const masActivo = SECUNDARIOS.some((e) => esActivo(ruta, e));
  const menu = useRef<HTMLDetailsElement>(null);
  // El menú "Más" se cierra al tocar fuera de él.
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);
  return (
    <nav className="barra-inferior" aria-label="Secciones del panel">
      {PRINCIPALES.map((e) => {
        const activo = esActivo(ruta, e);
        return (
          <Link key={e.href} href={e.href} className={activo ? "activo" : ""} aria-current={activo ? "page" : undefined}>
            <span className="barra-icono">
              <Icono d={ICONOS[e.href]!} />
              {e.href === "/panel/objeciones" && objeciones > 0 && <span className="insignia">{objeciones}</span>}
            </span>
            {e.etiqueta}
          </Link>
        );
      })}
      <details ref={menu} className={`barra-mas ${masActivo ? "activo" : ""}`} key={ruta}>
        <summary>
          <span className="barra-icono"><Icono d={ICONOS.mas!} /></span>
          Más
        </summary>
        <div className="barra-menu">
          {SECUNDARIOS.map((e) => (
            <Link key={e.href} href={e.href} className={esActivo(ruta, e) ? "activo" : ""}>
              {e.etiqueta}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

export function NavPanel({ objeciones }: { objeciones: number }) {
  const ruta = usePathname();
  return (
    <>
    <BarraInferior objeciones={objeciones} />
    <nav className="nav nav-panel">
      {ENLACES.map((e) => {
        const activo = e.exacto ? ruta === e.href : ruta.startsWith(e.href);
        return (
          <Link key={e.href} href={e.href} className={activo ? "activo" : ""} aria-current={activo ? "page" : undefined}>
            {e.etiqueta}
            {e.href === "/panel/objeciones" && objeciones > 0 && <span className="insignia">{objeciones}</span>}
          </Link>
        );
      })}
    </nav>
    </>
  );
}
