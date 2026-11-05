"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { leerPendientes } from "@/lib/cola";

export function Navegacion() {
  const ruta = usePathname();

  async function salir() {
    const pendientes = await leerPendientes();
    if (
      pendientes.some((p) => !p.rechazo) &&
      !confirm("Tienes checadas sin enviar. Si sales ahora se enviarán cuando vuelvas a entrar. ¿Salir?")
    ) {
      return;
    }
    // Las páginas guardadas para uso sin conexión contienen datos personales.
    if ("caches" in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    await fetch("/api/salir", { method: "POST" });
    window.location.href = "/entrar";
  }

  return (
    <nav className="nav">
      <Link href="/" className={ruta === "/" ? "activo" : ""}>
        Checar
      </Link>
      <Link href="/registros" className={ruta.startsWith("/registros") ? "activo" : ""}>
        Mis registros
      </Link>
      <Link href="/pin" className={ruta.startsWith("/pin") ? "activo" : ""}>
        PIN
      </Link>
      <button className="enlace" onClick={salir}>
        Salir
      </button>
    </nav>
  );
}
