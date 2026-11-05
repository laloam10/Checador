import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checador",
  description: "Registro electrónico de jornada laboral",
  appleWebApp: { capable: true, title: "Checador", statusBarStyle: "default" },
  icons: { apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f5132",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Renderizado dinámico en todas las páginas: necesario para que cada respuesta lleve
  // el nonce de la Content Security Policy (ver proxy.ts).
  await connection();
  return (
    <html lang="es-MX">
      <body>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
