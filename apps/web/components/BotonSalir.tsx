"use client";

import { salirDeLaApp } from "@/lib/salir";

export function BotonSalir({ children, className }: { children: React.ReactNode; className?: string }) {
  return <button type="button" className={className} onClick={salirDeLaApp}>{children}</button>;
}
