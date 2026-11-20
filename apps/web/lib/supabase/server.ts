import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { tokenDe } from "@/lib/appMovil";
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

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Cliente para una ruta de la API que usan tanto la PWA (sesión en cookies) como la app
 * instalada desde las tiendas (token en `Authorization: Bearer`). Con token, las consultas
 * llevan ese token y RLS aplica igual; la app nunca recibe ni usa la llave service_role.
 */
export async function clienteDeSolicitud(request: Request): Promise<{ supabase: Cliente; token: string | null }> {
  const token = tokenDe(request.headers.get("authorization"));
  if (!token) return { supabase: await crearClienteServidor(), token: null };
  const { url, key } = configSupabase();
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { supabase: supabase as unknown as Cliente, token };
}

/** Devuelve el id del usuario autenticado (JWT verificado) o null. Con `token`, verifica ese. */
export async function usuarioActual(supabase: Cliente, token?: string | null) {
  try {
    const { data } = await supabase.auth.getClaims(token ?? undefined);
    const sub = data?.claims?.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    // Un token mal formado hace que la verificación lance un error: es "sin sesión" (401), no un 500.
    return null;
  }
}
