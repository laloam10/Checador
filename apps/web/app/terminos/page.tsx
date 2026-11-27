import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Términos del servicio · Checador" };

export default function Terminos() {
  return <PaginaLegal nombre="terminos" />;
}
