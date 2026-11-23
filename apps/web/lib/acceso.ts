/**
 * "Salir" con bloqueo: si la persona eligió volver a entrar con su PIN, Salir no cierra la
 * sesión sino que la bloquea (migración 20261127000001_acceso_bloqueo.sql). La base es la que
 * impide checar con la sesión bloqueada; esta cookie solo sirve para que el proxy mande a la
 * pantalla de desbloqueo sin consultar la base en cada solicitud. Guarda el identificador de
 * la sesión bloqueada: si no coincide con la sesión actual, no aplica.
 */
export const COOKIE_BLOQUEO = "checador_bloqueo";

export const OPCIONES_COOKIE_BLOQUEO = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 400 * 24 * 60 * 60,
};

/** Lo único que se puede abrir con la sesión bloqueada. */
export function permitidaConBloqueo(ruta: string): boolean {
  return (
    ruta === "/desbloquear" ||
    ruta.startsWith("/entrar") ||
    ruta === "/api/salir" ||
    ruta.startsWith("/api/acceso/") ||
    ruta === "/api/despliegue" ||
    ruta === "/api/hora"
  );
}

/** Solo rutas propias (evita redirigir a otro sitio). */
export function rutaSiguiente(valor: string | null | undefined): string {
  return valor && /^\/(?![/\\])/.test(valor) && !valor.startsWith("/desbloquear") ? valor : "/";
}

export const RE_PIN = /^[0-9]{4,6}$/;
