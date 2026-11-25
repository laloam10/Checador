import { leerPendientes } from "@/lib/cola";

/**
 * Salir de la app en este teléfono. Si quedan checadas sin enviar, pregunta antes. Borra las
 * páginas guardadas para uso sin conexión (tienen datos personales). Si la persona eligió volver
 * a entrar con su PIN o su huella, solo bloquea este teléfono (/desbloquear).
 * Solo en el navegador (se llama desde un clic).
 */
export async function salirDeLaApp() {
  const pendientes = await leerPendientes();
  if (
    pendientes.some((p) => !p.rechazo) &&
    !confirm("Tienes checadas sin enviar. Si sales ahora se enviarán cuando vuelvas a entrar. ¿Salir?")
  ) {
    return;
  }
  if ("caches" in window) {
    for (const k of await caches.keys()) await caches.delete(k);
  }
  const r = await fetch("/api/salir", { method: "POST" }).then((x) => x.json()).catch(() => ({}));
  window.location.href = (r as { bloqueada?: boolean }).bloqueada ? "/desbloquear" : "/entrar";
}
