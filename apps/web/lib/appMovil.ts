/**
 * Preparación para la app instalada desde las tiendas (fase 2 de docs/plan-app-movil.md).
 * Reglas puras, sin red ni base de datos, para poder probarlas.
 *
 * La app nativa (Capacitor) no usa cookies: manda el token de sesión de Supabase en
 * `Authorization: Bearer`. Sus peticiones vienen de un origen propio de Capacitor, así
 * que estas rutas responden con CORS solo para esos orígenes.
 */

/** Orígenes de una app con Capacitor: iOS (capacitor://localhost) y Android (https://localhost). */
export const ORIGENES_APP = ["capacitor://localhost", "https://localhost"] as const;

/** Rutas de la API que la app instalada puede llamar desde su origen. */
export const RUTAS_APP = ["/api/eventos", "/api/conformidades", "/api/acuerdos/firmar", "/api/hora", "/api/app/version"] as const;

/** `extra`: orígenes adicionales separados por coma (solo para pruebas locales). */
export function origenAppPermitido(origen: string | null, extra = ""): origen is string {
  if (!origen) return false;
  const adicionales = extra.split(",").map((o) => o.trim()).filter(Boolean);
  return (ORIGENES_APP as readonly string[]).includes(origen) || adicionales.includes(origen);
}

export const rutaDeApp = (ruta: string) => (RUTAS_APP as readonly string[]).includes(ruta);

export function cabecerasCors(origen: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Checador-Plataforma, X-Checador-Version",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** Token de `Authorization: Bearer <jwt>`; null si no hay o no parece un JWT. */
export function tokenDe(autorizacion: string | null): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(autorizacion?.trim() ?? "");
  return m ? m[1]! : null;
}

/** Plataforma y versión que declara la app (solo informativas: van a la evidencia, no deciden nada). */
export function clienteApp(plataforma: string | null, version: string | null): { plataforma: string; version: string | null } {
  const p = (plataforma ?? "").toLowerCase();
  return {
    plataforma: p === "android" || p === "ios" ? p : "desconocida",
    version: /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version ?? "") ? version : null,
  };
}

/** Compara versiones "x.y.z": negativo si a < b, 0 si iguales, positivo si a > b. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
