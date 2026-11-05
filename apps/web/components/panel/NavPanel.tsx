"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/panel", etiqueta: "Tablero", exacto: true },
  { href: "/panel/trabajadores", etiqueta: "Trabajadores" },
  { href: "/panel/objeciones", etiqueta: "Objeciones" },
  { href: "/panel/exportar", etiqueta: "Exportar" },
  { href: "/panel/centros", etiqueta: "Centros" },
  { href: "/panel/accesos", etiqueta: "Accesos" },
];

export function NavPanel({ objeciones }: { objeciones: number }) {
  const ruta = usePathname();

  async function salir() {
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
    await fetch("/api/salir", { method: "POST" });
    window.location.href = "/entrar";
  }

  return (
    <nav className="nav nav-panel">
      {ENLACES.map((e) => {
        const activo = e.exacto ? ruta === e.href : ruta.startsWith(e.href);
        return (
          <Link key={e.href} href={e.href} className={activo ? "activo" : ""}>
            {e.etiqueta}
            {e.href === "/panel/objeciones" && objeciones > 0 && <span className="insignia">{objeciones}</span>}
          </Link>
        );
      })}
      <button className="enlace" onClick={salir}>Salir</button>
    </nav>
  );
}
