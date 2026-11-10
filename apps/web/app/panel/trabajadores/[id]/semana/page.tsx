import Link from "next/link";
import { notFound } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { FormAccion } from "@/components/panel/FormAccion";
import { hm, TablaSemana } from "@/components/TablaSemana";
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
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const partes = (f: string) => ({ d: Number(f.slice(8, 10)), m: MESES[Number(f.slice(5, 7)) - 1]!, a: f.slice(0, 4) });
/** "Lunes 26 de octubre". */
const nombreDia = (f: string) => `${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${partes(f).d} de ${partes(f).m}`;
/** "del 26 de octubre al 1 de noviembre de 2026". */
function nombreSemana(lunes: string) {
  const a = partes(lunes);
  const b = partes(sumarDias(lunes, 6));
  return a.m === b.m ? `del ${a.d} al ${b.d} de ${b.m} de ${b.a}` : `del ${a.d} de ${a.m} al ${b.d} de ${b.m} de ${b.a}`;
}

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
  const hoy = ahoraLocal.slice(0, 10);
  const cerrada = domingo < hoy;
  const estado = ultima
    ? ultima.respuesta === "conforme"
      ? { clase: "insignia-ok", texto: "Conforme" }
      : { clase: "insignia-error", texto: "Objetada" }
    : cerrada
      ? { clase: "insignia-aviso", texto: "Sin respuesta" }
      : { clase: "insignia-neutra", texto: "Semana en curso" };
  const t = semana.totales;
  const extra = t.extraDobleMin + t.extraTripleMin;

  // Bitácora agrupada por día (hora local del centro).
  const porDia = new Map<string, Captura[]>();
  for (const c of capturas) {
    const f = aHoraLocal(c.vigente, zona).slice(0, 10);
    porDia.set(f, [...(porDia.get(f) ?? []), c]);
  }

  return (
    <>
      <p className="migas"><Link href={`/panel/trabajadores/${trabajador.id}`}>← Ficha de {trabajador.nombre}</Link></p>
      <div className="semana-cabecera">
        <div>
          <h1>{trabajador.nombre}</h1>
          <p className="ayuda">
            Semana {nombreSemana(lunes)} · {trabajador.centro}{" "}
            <span className={`insignia-estado ${estado.clase}`}>{estado.texto}</span>
          </p>
        </div>
        <nav className="semana-botones" aria-label="Cambiar de semana">
          <Link className="boton-chico" href={`?semana=${sumarDias(lunes, -7)}`}>← Anterior</Link>
          {lunes !== lunesDe(hoy) && <Link className="boton-chico" href="?">Esta semana</Link>}
          {lunes < lunesDe(hoy) && <Link className="boton-chico" href={`?semana=${sumarDias(lunes, 7)}`}>Siguiente →</Link>}
        </nav>
      </div>

      {ultima && (
        <div className={`mensaje ${ultima.respuesta === "conforme" ? "mensaje-ok" : "mensaje-error"}`}>
          {ultima.respuesta === "conforme"
            ? `El trabajador dio su conformidad el ${local(ultima.respondido_en)}.`
            : `El trabajador OBJETÓ esta semana el ${local(ultima.respondido_en)}: “${ultima.comentario}”. Corrige lo necesario; el trabajador podrá revisarla y confirmar de nuevo.`}
        </div>
      )}

      <div className="indicadores indicadores-3">
        <div className="indicador">
          <span className="indicador-titulo">Trabajado</span>
          <span className="indicador-valor">{hm(t.trabajadoMin)}</span>
          <span className="indicador-detalle">horas en la semana</span>
        </div>
        <div className="indicador">
          <span className="indicador-titulo">Jornada ordinaria</span>
          <span className="indicador-valor">{hm(t.ordinariaMin)} <small>de {hm(semana.jornadaSemanalMaxMin)}</small></span>
          <div className={`progreso ${t.ordinariaMin >= semana.jornadaSemanalMaxMin ? "progreso-aviso" : ""}`}>
            <span style={{ width: `${Math.min(100, (t.ordinariaMin / semana.jornadaSemanalMaxMin) * 100)}%` }} />
          </div>
          <span className="indicador-detalle">máximo legal de la semana</span>
        </div>
        <div className={`indicador ${extra ? "indicador-aviso" : ""}`}>
          <span className="indicador-titulo">Tiempo extra</span>
          <span className="indicador-valor">{hm(extra)}</span>
          <span className="indicador-detalle">{hm(t.extraDobleMin)} al doble · {hm(t.extraTripleMin)} al triple</span>
        </div>
      </div>

      <TablaSemana lunes={lunes} semana={semana} reconstruccion={reconstruccion} vista="empleador" />

      <h2>Bitácora de la semana</h2>
      <p className="ayuda">
        Nada se borra: las correcciones y anulaciones quedan registradas con su motivo y el registro original se conserva.
      </p>
      {capturas.length === 0 ? (
        <p className="vacio">Sin checadas esta semana.</p>
      ) : (
        <div className="bitacora-dias">
          {[...porDia.entries()].map(([dia, lista]) => (
            <section key={dia} className="bitacora-dia">
              <h3>{nombreDia(dia)}</h3>
              <ul className="bitacora">
                {lista.map((c) => (
                  <li key={c.id}>
                    <div className="bitacora-fila">
                      <span className={`bitacora-hora ${c.anulada ? "tachado" : ""}`}>{aHoraLocal(c.vigente, zona).slice(11)}</span>
                      <span className={c.anulada ? "tachado" : ""}>{ETIQUETA[c.tipo]}</span>
                      <span className="etiqueta etiqueta-origen">{ORIGEN[c.origen]}</span>
                      {c.diferido && <span className="etiqueta">sin conexión</span>}
                    </div>
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
            </section>
          ))}
        </div>
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
