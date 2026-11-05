import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configSupabase } from "./config";

/** Cliente de Supabase para Server Components y Route Handlers (sesión del usuario, con RLS). */
export async function crearClienteServidor() {
  const cookieStore = await cookies();
  const { url, key } = configSupabase();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Devuelve el id del usuario autenticado (JWT verificado) o null. */
export async function usuarioActual(supabase: Awaited<ReturnType<typeof crearClienteServidor>>) {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}
