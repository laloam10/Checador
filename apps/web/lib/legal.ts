import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leerDocumentoLegal, type DocumentoLegal } from "./markdownLegal";

/**
 * Términos del servicio y aviso de privacidad de Checador (docs/legal/README.md). El texto vive
 * en apps/web/content/legal/ (next.config los incluye en la compilación).
 */
export type NombreLegal = "terminos" | "privacidad";

export function documentoLegal(nombre: NombreLegal): DocumentoLegal {
  return leerDocumentoLegal(readFileSync(join(process.cwd(), "content", "legal", `${nombre}.md`), "utf8"));
}

/** Publicados (revisados por el abogado): se muestran en producción y se piden al crear la empresa. */
export const legalPublicado = () => process.env.LEGAL_PUBLICADO === "1";

/** Las páginas existen en producción solo publicadas; en pruebas y local se ven como borrador. */
export const legalVisible = () => legalPublicado() || process.env.VERCEL_ENV !== "production";

export function versionesLegales() {
  return { terminos: documentoLegal("terminos").version, privacidad: documentoLegal("privacidad").version };
}
