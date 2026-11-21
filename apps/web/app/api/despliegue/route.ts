import { DESPLIEGUE } from "@/lib/despliegue";

// Versión del despliegue vigente (ver lib/despliegue.ts). Pública: no revela datos.
export function GET() {
  return Response.json({ despliegue: DESPLIEGUE }, { headers: { "Cache-Control": "no-store" } });
}
