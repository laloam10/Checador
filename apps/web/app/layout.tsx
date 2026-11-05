import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
