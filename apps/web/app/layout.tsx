import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { connection } from "next/server";
import { AvisoActualizacion } from "@/components/AvisoActualizacion";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

// Se descargan al compilar y se sirven desde el mismo dominio (la CSP solo permite font-src 'self').
const texto = Inter({ subsets: ["latin"], display: "swap", variable: "--fuente-texto" });
const titulos = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--fuente-titulos" });
// Horas, folios y etiquetas: cifras de ancho fijo para que las columnas no "bailen".
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--fuente-mono" });

const DESCRIPCION = "Registro electrónico de jornada para tu negocio: entradas, salidas y horas extra desde el celular, un kiosco o WhatsApp.";

// La vista previa al compartir un enlace (WhatsApp, Facebook, correo) usa app/opengraph-image.png
// (se regenera con scripts/imagen-compartir.mjs). Su dirección debe ser absoluta: se arma con el
// dominio de la petición, para que pruebas y producción apunten cada una a su propia imagen.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "checador.jemba.mx";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("127.") || host.startsWith("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${protocolo}://${host}`),
    title: "Checador",
    description: DESCRIPCION,
    applicationName: "Checador",
    appleWebApp: { capable: true, title: "Checador", statusBarStyle: "default" },
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon-180.png" },
    openGraph: { type: "website", locale: "es_MX", siteName: "Checador por Jemba", title: "Checador: registro de jornada", description: DESCRIPCION },
    twitter: { card: "summary_large_image", title: "Checador: registro de jornada", description: DESCRIPCION },
  };
}

export const viewport: Viewport = {
  themeColor: "#0A2103",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Renderizado dinámico en todas las páginas: necesario para que cada respuesta lleve
  // el nonce de la Content Security Policy (ver proxy.ts).
  await connection();
  return (
    <html lang="es-MX" className={`${texto.variable} ${titulos.variable} ${mono.variable}`}>
      <body>
        <AvisoActualizacion />
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
