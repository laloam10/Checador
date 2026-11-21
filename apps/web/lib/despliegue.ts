/**
 * Versión del despliegue: sirve para avisar que hay una versión nueva de Checador.
 *
 * El valor se fija al compilar (next.config.ts) y queda igual en el navegador y en el
 * servidor de ese despliegue. Las llamadas propias con fetch() no las fija Vercel al
 * despliegue que sirvió la página (Skew Protection solo cubre lo que hace Next.js): por eso
 * /api/despliegue siempre responde el despliegue vigente, y si difiere del de la página
 * abierta, hay versión nueva.
 */
export const DESPLIEGUE = process.env.NEXT_PUBLIC_CHECADOR_DESPLIEGUE || "desarrollo";

/** Cada cuánto se consulta, además de al volver a la pestaña y al recuperar la conexión. */
export const INTERVALO_DESPLIEGUE_MS = 5 * 60_000;

const RE_DESPLIEGUE = /^[A-Za-z0-9_-]{1,64}$/;

/** true si el servidor ya tiene otro despliegue. Ante una respuesta rara, no se avisa. */
export function hayVersionNueva(local: string, respuesta: unknown): boolean {
  if (!respuesta || typeof respuesta !== "object") return false;
  const remoto = (respuesta as { despliegue?: unknown }).despliegue;
  if (typeof remoto !== "string" || !RE_DESPLIEGUE.test(remoto)) return false;
  return remoto !== local;
}
