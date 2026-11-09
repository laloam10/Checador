"use client";

import Link from "next/link";
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

export function NavPanel({ objeciones }: { objeciones: number }) {
  const ruta = usePathname();
  return (
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
  );
}
