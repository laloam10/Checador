import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

// Identifica el código de este despliegue (ver lib/despliegue.ts). Se usa el commit y no la
// hora de compilación: next.config se evalúa más de una vez al compilar y el valor debe ser
// el mismo en el navegador y en el servidor.
function despliegue(): string {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (commit) return commit.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "desarrollo";
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@checador/jornada"],
  poweredByHeader: false,
  env: { NEXT_PUBLIC_CHECADOR_DESPLIEGUE: despliegue() },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HTTPS obligatorio por dos años (solo tiene efecto cuando se sirve por HTTPS).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Sin cámara ni micrófono (no hay biometría). La ubicación solo la usa la propia app, al checar,
          // en los centros que la activaron (migración 20261129000001_ubicacion.sql).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
