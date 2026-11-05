"use client";

import { createBrowserClient } from "@supabase/ssr";
import { configSupabase } from "./config";

export function crearClienteNavegador() {
  const { url, key } = configSupabase();
  return createBrowserClient(url, key);
}
