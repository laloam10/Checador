import "server-only";

import { createClient } from "@supabase/supabase-js";
import { configSupabase } from "./config";

/**
 * Cliente sin sesión (rol anon) para procesos del servidor que no tienen usuario
 * (webhook de WhatsApp, envío de avisos). Solo puede ejecutar las funciones que exigen un
 * secreto de servicio. Nunca se usa la llave service_role.
 */
export function clienteSinSesion() {
  const { url, key } = configSupabase();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
