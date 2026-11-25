import Link from "next/link";
import { folio } from "@/lib/acuerdo";
import { firmaDe, MODALIDAD, type Acuerdo, type EstadoAcuerdo } from "@/lib/acuerdosDatos";
import { fechaHora } from "@/lib/formato";
import type { ContextoPanel } from "@/lib/panel";
import { generarYFirmarAcuerdo, registrarFirmaAutografa } from "@/app/panel/acciones";
import { FormAccion } from "./FormAccion";
import { TextoAcuerdo } from "@/components/TextoAcuerdo";

function Firmas({ a, zona }: { a: Acuerdo; zona: string }) {
  return (
    <ul className="firmas">
      {(["empleador", "trabajador"] as const).map((quien) => {
        const f = firmaDe(a, quien);
        return (
          <li key={quien} className={f ? "firmada" : "pendiente"}>
            <span className="firma-marca" aria-hidden>{f ? "✓" : "…"}</span>
            <span>
              {quien === "empleador" ? "Empresa" : "Persona trabajadora"}:{" "}
              {f ? `${MODALIDAD[f.modalidad]}, ${fechaHora(f.firmado_en, zona, true)}` : <strong>pendiente</strong>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Versión de un acuerdo con su folio, enlace para imprimir y firmas. */
function Version({ a, titulo, tono, zona, enlace, children }: {
  a: Acuerdo;
  titulo: string;
  tono: "ok" | "aviso";
  zona: string;
  enlace: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`acuerdo-version tono-${tono}`}>
      <div className="acuerdo-version-cabecera">
        <strong>{titulo}</strong>
        <span className="acuerdo-folio">folio {folio(a.contenido_hash)}</span>
        <Link href={enlace}>ver / imprimir</Link>
      </div>
      <Firmas a={a} zona={zona} />
      {children}
    </div>
  );
}

export async function SeccionAcuerdo({ ctx, trabajadorId, gestor, e }: {
  ctx: ContextoPanel;
  trabajadorId: string;
  gestor: boolean;
  e: EstadoAcuerdo & { textoPropuesto: string | null };
}) {
  const zona = ctx.empresa.zonaHoraria;
  const enlace = (a: Acuerdo) => `/panel/trabajadores/${trabajadorId}/acuerdos/${a.id}`;
  const proponer = gestor && e.textoPropuesto && (e.desactualizado || (!e.vigente && !e.pendiente));

  return (
    <>
      <h2 id="acuerdo">Acuerdo de registro electrónico</h2>
      <div className="form-panel panel-grupos">
        <section className="grupo-campos">
          <div className="grupo-titulo">
            <h3>Respaldo legal</h3>
            <p>El registro hace prueba plena si se acredita que fue acordado con la persona trabajadora (art. 132 fr. XXXIV LFT).</p>
          </div>
          <div className="grupo-cuerpo">
            {e.vigente ? (
              <Version a={e.vigente} titulo={`Vigente: versión ${e.vigente.version}`} tono="ok" zona={zona} enlace={enlace(e.vigente)} />
            ) : e.pendiente ? (
              <p className="mensaje mensaje-aviso">Aún sin acuerdo vigente: falta que la persona firme la versión {e.pendiente.version}.</p>
            ) : (
              <p className="mensaje mensaje-error">Sin acuerdo vigente: sus registros no tienen el respaldo de un acuerdo firmado.</p>
            )}

            {e.pendiente && (
              <Version a={e.pendiente} titulo={`Versión ${e.pendiente.version} pendiente de firma de la persona trabajadora`}
                tono="aviso" zona={zona} enlace={enlace(e.pendiente)}>
                <p className="ayuda">Puede firmarla en su app (sección Acuerdo), en el kiosco con su PIN, o en papel.</p>
                {gestor && (
                  <details className="desplegable">
                    <summary>Registrar firma en papel</summary>
                    <FormAccion accion={registrarFirmaAutografa} boton="Registrar firma autógrafa" className="form-plano">
                      <input type="hidden" name="acuerdo_id" value={e.pendiente.id} />
                      <div className="campos campos-2">
                        <label>Fecha de firma<input type="date" name="fecha_firma" required /></label>
                        <label>Dónde se resguarda el original<input name="resguardo" required placeholder="Ej.: expediente físico en RH" /></label>
                      </div>
                      <label className="casilla-linea">
                        <input type="checkbox" name="confirmo" /> El documento firmado tiene impreso el folio {folio(e.pendiente.contenido_hash)}
                      </label>
                    </FormAccion>
                  </details>
                )}
              </Version>
            )}

            {proponer && (
              <>
                {(e.vigente || e.pendiente) && (
                  <p className="mensaje mensaje-aviso">
                    Los datos de la persona o del centro cambiaron desde el último acuerdo (jornada, descanso, pausa, método de
                    registro o ubicación). Genera una nueva versión para que ambos la firmen.
                  </p>
                )}
                <details className="desplegable desplegable-accion">
                  <summary>Revisar y firmar la versión {e.siguienteVersion}</summary>
                  <p className="ayuda">
                    Plantilla de referencia: revísala con tu abogado laboral antes de usarla. El texto se genera con los datos
                    actuales de la persona y del centro.
                  </p>
                  <TextoAcuerdo texto={e.textoPropuesto!} />
                  <FormAccion accion={generarYFirmarAcuerdo} boton={`Firmar versión ${e.siguienteVersion} como empresa`} className="form-plano">
                    <input type="hidden" name="trabajador_id" value={trabajadorId} />
                    <label className="casilla-linea">
                      <input type="checkbox" name="confirmo" /> Revisé el texto y lo firmo en representación de {ctx.empresa.razonSocial}
                    </label>
                  </FormAccion>
                </details>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
