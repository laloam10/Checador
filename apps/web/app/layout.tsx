import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { connection } from "next/server";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

// Se descargan al compilar y se sirven desde el mismo dominio (la CSP solo permite font-src 'self').
const texto = Inter({ subsets: ["latin"], display: "swap", variable: "--fuente-texto" });
const titulos = Manrope({ subsets: ["latin"], display: "swap", variable: "--fuente-titulos" });

export const metadata: Metadata = {
  title: "Checador",
  description: "Registro electrónico de jornada laboral",
  appleWebApp: { capable: true, title: "Checador", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0E6B50",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Renderizado dinámico en todas las páginas: necesario para que cada respuesta lleve
  // el nonce de la Content Security Policy (ver proxy.ts).
  await connection();
  return (
    <html lang="es-MX" className={`${texto.variable} ${titulos.variable}`}>
      <body>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
