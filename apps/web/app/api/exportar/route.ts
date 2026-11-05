import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { csvBitacora, csvResumen, datosTrabajador, sha256, type DatosTrabajadorExport } from "@/lib/exportacion";
import { lunesDe, sumarDias } from "@/lib/fechas";
import { membresiaPanel } from "@/lib/panel";
import { generarPdf } from "@/lib/pdf";
import { crearClienteServidor } from "@/lib/supabase/server";

const FORMATOS = new Set(["pdf", "csv_bitacora", "csv_resumen"]);
const MAX_SEMANAS = 53;
const MAX_TRABAJADORES_TODOS = 200;

/**
 * Exportación para inspección o juicio. Genera el archivo, lo registra en
 * `exportaciones` (huella SHA-256 del archivo y de los datos, estado de la cadena)
 * y lo entrega como descarga.
 *
 * GET /api/exportar?trabajador=<uuid|todos>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&formato=pdf|csv_bitacora|csv_resumen
 */
export async function GET(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return error(401, "Sesión expirada. Vuelve a entrar.");
  const m = await membresiaPanel(supabase, userId);
  if (!m) return error(403, "Solo el personal del panel puede exportar.");
  const empresa = m.empresa;

  const q = request.nextUrl.searchParams;
  const formato = q.get("formato") ?? "";
  const trabajador = q.get("trabajador") ?? "";
  const desde = q.get("desde") ?? "";
  const hasta = q.get("hasta") ?? "";
  if (!FORMATOS.has(formato)) return error(400, "Formato inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) {
    return error(400, "Periodo inválido.");
  }
  // Semanas completas: el tiempo extra se calcula por semana.
  const lunesInicio = lunesDe(desde);
  const domingoFin = sumarDias(lunesDe(hasta), 6);
  const semanas = (Date.parse(domingoFin) - Date.parse(lunesInicio)) / (7 * 86_400_000) + 1 / 7;
  if (semanas > MAX_SEMANAS) return error(400, `El periodo no puede exceder ${MAX_SEMANAS} semanas.`);
  if (trabajador === "todos" && formato === "pdf") return error(400, "El PDF es por trabajador; para todos usa CSV.");

  let ids: string[];
  if (trabajador === "todos") {
    const { data } = await supabase
      .from("trabajadores")
      .select("id")
      .eq("empresa_id", empresa.id)
      .lte("fecha_ingreso", domingoFin)
      .or(`fecha_baja.is.null,fecha_baja.gte.${lunesInicio}`)
      .order("nombre");
    ids = (data ?? []).map((t) => t.id);
    if (ids.length > MAX_TRABAJADORES_TODOS) return error(400, "Demasiados trabajadores: exporta por centro o por persona.");
  } else {
    ids = [trabajador];
  }

  const lista: DatosTrabajadorExport[] = [];
  for (const id of ids) {
    const d = await datosTrabajador(supabase, id, lunesInicio, domingoFin);
    if (!d || d.trabajador.empresaId !== empresa.id) return error(404, "Trabajador no encontrado.");
    lista.push(d);
  }

  // Integridad y estado de la cadena al momento de emitir.
  const [{ data: primeraInvalida, error: errV }, { data: cadena }] = await Promise.all([
    supabase.rpc("verificar_cadena", { p_empresa: empresa.id }),
    supabase.from("cadena_estado").select("ultima_secuencia, ultimo_hash").eq("empresa_id", empresa.id).single(),
  ]);
  if (errV || !cadena) return error(500, "No se pudo verificar la integridad de la bitácora.");
  const integridad = {
    integra: primeraInvalida === null,
    primeraInvalida: primeraInvalida as number | null,
    secuencia: cadena.ultima_secuencia as number,
    hash: String(cadena.ultimo_hash).replace(/^\\x/, ""),
  };

  const id = randomUUID();
  const bitacora = csvBitacora(lista);
  const hashDatos = sha256(formato === "csv_resumen" ? csvResumen(lista) : bitacora);
  let archivo: Uint8Array;
  let tipo: string;
  if (formato === "pdf") {
    archivo = await generarPdf(lista[0]!, {
      id,
      emitidoEn: new Date(),
      emitidoPor: typeof claims?.claims?.email === "string" ? claims.claims.email : userId,
      empresa: { razonSocial: empresa.razonSocial, rfc: empresa.rfc },
      lunesInicio,
      domingoFin,
      integridad,
      hashDatos,
    });
    tipo = "application/pdf";
  } else {
    archivo = new TextEncoder().encode(formato === "csv_resumen" ? csvResumen(lista) : bitacora);
    tipo = "text/csv; charset=utf-8";
  }
  const hashArchivo = sha256(archivo);

  const { error: errReg } = await supabase.from("exportaciones").insert({
    id,
    empresa_id: empresa.id,
    trabajador_id: trabajador === "todos" ? null : trabajador,
    desde: lunesInicio,
    hasta: domingoFin,
    formato,
    hash_archivo: `\\x${hashArchivo}`,
    hash_datos: `\\x${hashDatos}`,
    cadena_secuencia: integridad.secuencia,
    cadena_hash: `\\x${integridad.hash}`,
    cadena_integra: integridad.integra,
  });
  if (errReg) {
    console.error("Registro de exportación", errReg);
    return error(500, "No se pudo registrar la exportación; el archivo no se emitió.");
  }

  const quien = trabajador === "todos" ? "todos" : (lista[0]!.ficha.numero ?? lista[0]!.trabajador.nombre).replace(/[^\w-]+/g, "_");
  const ext = formato === "pdf" ? "pdf" : "csv";
  const nombre = `checador_${formato}_${quien}_${lunesInicio}_${domingoFin}.${ext}`;
  return new NextResponse(Buffer.from(archivo), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
      "X-Checador-Exportacion": id,
      "X-Checador-Sha256": hashArchivo,
    },
  });
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}
