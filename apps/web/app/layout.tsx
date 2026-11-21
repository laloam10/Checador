import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { connection } from "next/server";
import { AvisoActualizacion } from "@/components/AvisoActualizacion";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

// Se descargan al compilar y se sirven desde el mismo dominio (la CSP solo permite font-src 'self').
const texto = Inter({ subsets: ["latin"], display: "swap", variable: "--fuente-texto" });
const titulos = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--fuente-titulos" });
// Horas, folios y etiquetas: cifras de ancho fijo para que las columnas no "bailen".
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--fuente-mono" });

export const metadata: Metadata = {
  title: "Checador",
  description: "Registro electrónico de jornada laboral",
  appleWebApp: { capable: true, title: "Checador", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon-180.png" },
};

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
