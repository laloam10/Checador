import type { NextRequest } from "next/server";

/** Evidencia mínima de la solicitud, tomada en el servidor (no la envía el cliente). */
export function evidenciaDe(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  return {
    ip,
    agente: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}
