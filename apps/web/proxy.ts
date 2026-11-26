import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_BLOQUEO, permitidaConBloqueo } from "@/lib/acceso";
import { cabecerasCors, origenAppPermitido, rutaDeApp } from "@/lib/appMovil";

/**
 * Corre antes de cada petición:
 *  1. Genera un nonce y aplica la Content Security Policy (solo se ejecutan scripts propios
 *     con ese nonce; solo se conecta al propio dominio y a Supabase).
 *  2. Refresca la sesión de Supabase.
 *  3. Redirige a /entrar si no hay sesión (las rutas /api responden 401 por sí mismas).
 *  4. Con la sesión bloqueada (lib/acceso.ts), manda a /desbloquear; las rutas /api responden
 *     423. La base impide checar de todos modos; esto evita mostrar pantallas a medias.
 *  5. CORS solo para la app instalada desde las tiendas (orígenes de Capacitor) y solo en las
 *     rutas que usa (lib/appMovil.ts). La app manda su token en Authorization, sin cookies.
 */
export async function proxy(request: NextRequest) {
  const origen = request.headers.get("origin");
  const cors = rutaDeApp(request.nextUrl.pathname) && origenAppPermitido(origen, process.env.APP_ORIGENES_EXTRA)
    ? cabecerasCors(origen!)
    : null;
  if (cors && request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });

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
  // /guia: guía rápida pública, para enlazarla desde la página de Jemba.
  const publica = ruta.startsWith("/entrar") || ruta.startsWith("/api") || ruta === "/guia";

  if (!data?.claims && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = ruta === "/" ? "" : `?siguiente=${encodeURIComponent(ruta)}`;
    const redireccion = NextResponse.redirect(url);
    redireccion.headers.set("Content-Security-Policy", csp);
    return redireccion;
  }
  const sesion = (data?.claims as { session_id?: string } | undefined)?.session_id;
  if (sesion && request.cookies.get(COOKIE_BLOQUEO)?.value === sesion && !permitidaConBloqueo(ruta)) {
    let bloqueo: NextResponse;
    if (ruta.startsWith("/api/")) {
      bloqueo = NextResponse.json({ ok: false, error: "Checador está bloqueado en este teléfono. Desbloquéalo con tu PIN." }, { status: 423 });
    } else {
      const url = request.nextUrl.clone();
      url.pathname = "/desbloquear";
      url.search = ruta === "/" ? "" : `?siguiente=${encodeURIComponent(ruta + request.nextUrl.search)}`;
      bloqueo = NextResponse.redirect(url);
    }
    // Conserva la sesión refrescada (los refresh tokens rotan: perderla cerraría la sesión).
    for (const c of response.cookies.getAll()) bloqueo.cookies.set(c);
    bloqueo.headers.set("Content-Security-Policy", csp);
    if (cors) for (const [k, v] of Object.entries(cors)) bloqueo.headers.set(k, v);
    return bloqueo;
  }

  response.headers.set("Content-Security-Policy", csp);
  if (cors) for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
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
    // Solo la ventana de mapa de una checada (Maps Embed API), y solo al abrirla.
    "frame-src https://www.google.com/maps/embed/",
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
    // Todo excepto estáticos, íconos, imagen para compartir, manifiesto y service worker.
    // La imagen para compartir es pública: la piden WhatsApp y otras apps sin sesión.
    "/((?!_next/static|_next/image|favicon.ico|icon\\.svg|icon-.*\\.png|opengraph-image|twitter-image|manifest.webmanifest|sw.js).*)",
  ],
};
