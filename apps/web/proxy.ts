import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Corre antes de cada petición:
 *  1. Genera un nonce y aplica la Content Security Policy (solo se ejecutan scripts propios
 *     con ese nonce; solo se conecta al propio dominio y a Supabase).
 *  2. Refresca la sesión de Supabase.
 *  3. Redirige a /entrar si no hay sesión (las rutas /api responden 401 por sí mismas).
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaSeguridad(nonce, request.nextUrl.protocol === "https:");

  const cabeceras = new Headers(request.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("Content-Security-Policy", csp); // Next.js toma el nonce de aquí al renderizar
  const siguiente = () => NextResponse.next({ request: { headers: cabeceras } });
  let response = siguiente();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          cabeceras.set("cookie", request.cookies.toString());
          response = siguiente();
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const ruta = request.nextUrl.pathname;
  const publica = ruta.startsWith("/entrar") || ruta.startsWith("/api");

  if (!data?.claims && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = ruta === "/" ? "" : `?siguiente=${encodeURIComponent(ruta)}`;
    const redireccion = NextResponse.redirect(url);
    redireccion.headers.set("Content-Security-Policy", csp);
    return redireccion;
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function politicaSeguridad(nonce: string, https: boolean): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Estilos en línea permitidos: el riesgo es mucho menor que en scripts y React usa atributos style.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase}`.trim(),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const config = {
  matcher: [
    // Todo excepto estáticos, íconos, manifiesto y service worker.
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.webmanifest|sw.js).*)",
  ],
};
