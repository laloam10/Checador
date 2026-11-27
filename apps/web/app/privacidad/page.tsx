import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Aviso de privacidad · Checador" };

export default function Privacidad() {
  return <PaginaLegal nombre="privacidad" />;
}
