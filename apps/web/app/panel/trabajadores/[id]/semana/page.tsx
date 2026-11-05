import Link from "next/link";
import { notFound } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { TablaSemana } from "@/components/TablaSemana";
import { lunesDe, semanaDeTrabajador, sumarDias, trabajadorPorId, type FilaEvento } from "@/lib/datos";
import { requierePanel } from "@/lib/panel";
import { agregarChecada, anularChecada, corregirChecada } from "../../../acciones";

const ETIQUETA: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
};
const ORIGEN: Record<string, string> = { pwa: "celular", kiosco: "kiosco", panel: "panel" };

interface Captura extends FilaEvento {
  vigente: string; // hora efectiva tras correcciones
  anulada: FilaEvento | null;
  correcciones: FilaEvento[];
}

/** Agrupa cada checada con sus correcciones y anulaciones (en orden de registro). */
function agrupar(filas: FilaEvento[]): Captura[] {
  const raiz = new Map<number, number>();
  const capturas = new Map<number, Captura>();
  for (const f of [...filas].sort((a, b) => a.id - b.id)) {
    if (f.tipo === "correccion" || f.tipo === "anulacion") {
      let r = f.corrige_evento_id!;
      while (raiz.has(r)) r = raiz.get(r)!;
      raiz.set(f.id, r);
      const c = capturas.get(r);
      if (!c) continue;
      if (f.tipo === "anulacion") c.anulada = f;
      else {
        c.correcciones.push(f);
        c.vigente = f.hora_efectiva;
      }
    } else {
      capturas.set(f.id, { ...f, vigente: f.hora_efectiva, anulada: null, correcciones: [] });
    }
  }
  return [...capturas.values()].sort((a, b) => Date.parse(a.vigente) - Date.parse(b.vigente));
}

export default async function SemanaPanel({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semana?: string }>;
}) {
  const [{ id }, { semana: param }] = await Promise.all([params, searchParams]);
  const ctx = await requierePanel();
  const trabajador = await trabajadorPorId(ctx.supabase, id);
  if (!trabajador || trabajador.empresaId !== ctx.empresa.id) notFound();

  const zona = trabajador.zonaHoraria;
  const ahoraLocal = aHoraLocal(new Date(), zona);
  const lunes = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? lunesDe(param) : lunesDe(ahoraLocal.slice(0, 10));
  const domingo = sumarDias(lunes, 6);

  const [{ semana, reconstruccion, filas }, { data: conformidades }] = await Promise.all([
    semanaDeTrabajador(ctx.supabase, trabajador, lunes),
    ctx.supabase
      .from("conformidades")
      .select("respuesta, comentario, respondido_en")
      .eq("trabajador_id", trabajador.id)
      .eq("periodo_inicio", lunes)
      .order("respondido_en", { ascending: false }),
  ]);
  const capturas = agrupar(filas).filter((c) => {
    const f = aHoraLocal(c.vigente, zona).slice(0, 10);
    return f >= lunes && f <= domingo;
  });
  const ultima = conformidades?.[0];
  const local = (iso: string) => aHoraLocal(iso, zona).replace("T", " ");

  return (
    <>
      <p><Link href={`/panel/trabajadores/${trabajador.id}`}>← {trabajador.nombre}</Link></p>
      <div className="semana-nav">
        <Link href={`?semana=${sumarDias(lunes, -7)}`}>← Anterior</Link>
        <strong>{lunes} al {domingo}</strong>
        <Link href={`?semana=${sumarDias(lunes, 7)}`}>Siguiente →</Link>
      </div>

      {ultima && (
        <div className={`mensaje ${ultima.respuesta === "conforme" ? "mensaje-ok" : "mensaje-error"}`}>
          {ultima.respuesta === "conforme"
            ? `El trabajador dio su conformidad el ${local(ultima.respondido_en)}.`
            : `El trabajador OBJETÓ esta semana el ${local(ultima.respondido_en)}: “${ultima.comentario}”. Corrige lo necesario; el trabajador podrá revisarla y confirmar de nuevo.`}
        </div>
      )}

      <TablaSemana lunes={lunes} semana={semana} reconstruccion={reconstruccion} />

      <h2>Bitácora de la semana</h2>
      <p className="ayuda">
        Nada se borra: las correcciones y anulaciones quedan registradas con su motivo y el registro original se conserva.
      </p>
      {capturas.length === 0 ? (
        <p className="vacio">Sin checadas esta semana.</p>
      ) : (
        <ul className="bitacora">
          {capturas.map((c) => (
            <li key={c.id}>
              <span className={c.anulada ? "tachado" : ""}>
                <strong>{local(c.vigente)}</strong> · {ETIQUETA[c.tipo]}
              </span>{" "}
              <span className="etiqueta">{ORIGEN[c.origen]}</span>
              {c.diferido && <span className="etiqueta">sin conexión</span>}
              {c.origen === "panel" && c.motivo && <span className="ajuste">Capturada por el empleador: {c.motivo}</span>}
              {c.correcciones.map((k) => (
                <span key={k.id} className="ajuste">
                  Corregida a {local(k.hora_efectiva)} el {local(k.hora_servidor)}: {k.motivo}
                  {k === c.correcciones[0] && ` (original: ${local(c.hora_efectiva)})`}
                </span>
              ))}
              {c.anulada && <span className="ajuste">Anulada el {local(c.anulada.hora_servidor)}: {c.anulada.motivo}</span>}
              {!c.anulada && (
                <details>
                  <summary>Corregir o anular</summary>
                  <FormAccion accion={corregirChecada} boton="Corregir hora" className="form-panel form-linea">
                    <input type="hidden" name="trabajador_id" value={trabajador.id} />
                    <input type="hidden" name="evento_id" value={c.id} />
                    <label>Hora correcta<input type="datetime-local" name="hora" required
                      defaultValue={aHoraLocal(c.vigente, zona)} max={ahoraLocal} /></label>
                    <label>Motivo<input name="motivo" required placeholder="Ej.: el trabajador olvidó checar a tiempo" /></label>
                  </FormAccion>
                  <FormAccion accion={anularChecada} boton="Anular checada" peligro className="form-panel form-linea">
                    <input type="hidden" name="trabajador_id" value={trabajador.id} />
                    <input type="hidden" name="evento_id" value={c.id} />
                    <label>Motivo de la anulación<input name="motivo" required placeholder="Ej.: checada duplicada" /></label>
                  </FormAccion>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Agregar checada faltante</h2>
      <FormAccion accion={agregarChecada} boton="Agregar a la bitácora" limpiar>
        <input type="hidden" name="trabajador_id" value={trabajador.id} />
        <div className="campos">
          <label>
            Tipo
            <select name="tipo" defaultValue="salida">
              {Object.entries(ETIQUETA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Fecha y hora<input type="datetime-local" name="hora" required max={ahoraLocal} /></label>
          <label>Motivo<input name="motivo" required placeholder="Ej.: olvidó checar su salida" /></label>
        </div>
        <label className="casilla-linea">
          <input type="checkbox" name="puede_salir" defaultChecked /> Si es una pausa: el trabajador podía salir del lugar
        </label>
      </FormAccion>
    </>
  );
}
