import Link from "next/link";
import { aHoraLocal } from "@checador/jornada";
import { folio } from "@/lib/acuerdo";
import { estadoAcuerdo, firmaDe, MODALIDAD, type Acuerdo } from "@/lib/acuerdosDatos";
import type { ContextoPanel } from "@/lib/panel";
import { generarYFirmarAcuerdo, registrarFirmaAutografa } from "@/app/panel/acciones";
import { FormAccion } from "./FormAccion";

function Firmas({ a, zona }: { a: Acuerdo; zona: string }) {
  return (
    <ul>
      {(["empleador", "trabajador"] as const).map((quien) => {
        const f = firmaDe(a, quien);
        return (
          <li key={quien}>
            {quien === "empleador" ? "Empresa" : "Persona trabajadora"}:{" "}
            {f ? `${MODALIDAD[f.modalidad]}, ${aHoraLocal(f.firmado_en, zona).replace("T", " ")}` : <strong>pendiente</strong>}
          </li>
        );
      })}
    </ul>
  );
}

export async function SeccionAcuerdo({ ctx, trabajadorId, gestor }: { ctx: ContextoPanel; trabajadorId: string; gestor: boolean }) {
  const e = await estadoAcuerdo(ctx.supabase, trabajadorId);
  const zona = ctx.empresa.zonaHoraria;
  const enlace = (a: Acuerdo) => `/panel/trabajadores/${trabajadorId}/acuerdos/${a.id}`;

  return (
    <>
      <h2>Acuerdo de registro electrónico</h2>
      <p className="ayuda">
        El registro hace prueba plena si se acredita que fue acordado con la persona trabajadora (art. 132 fr. XXXIV LFT).
      </p>

      {e.vigente ? (
        <div className="mensaje mensaje-ok">
          <p>
            <strong>Vigente: versión {e.vigente.version}</strong> · folio {folio(e.vigente.contenido_hash)} ·{" "}
            <Link href={enlace(e.vigente)}>ver / imprimir</Link>
          </p>
          <Firmas a={e.vigente} zona={zona} />
        </div>
      ) : (
        <p className="mensaje mensaje-error">Sin acuerdo vigente: sus registros no tienen el respaldo de un acuerdo firmado.</p>
      )}

      {e.pendiente && (
        <div className="mensaje mensaje-aviso">
          <p>
            <strong>Versión {e.pendiente.version} pendiente de firma de la persona trabajadora</strong> · folio{" "}
            {folio(e.pendiente.contenido_hash)} · <Link href={enlace(e.pendiente)}>ver / imprimir</Link>
          </p>
          <p>Puede firmarla en su app (sección Acuerdo), en el kiosco con su PIN, o en papel.</p>
          {gestor && (
            <details>
              <summary>Registrar firma en papel</summary>
              <FormAccion accion={registrarFirmaAutografa} boton="Registrar firma autógrafa">
                <input type="hidden" name="acuerdo_id" value={e.pendiente.id} />
                <div className="campos">
                  <label>Fecha de firma<input type="date" name="fecha_firma" required /></label>
                  <label>Dónde se resguarda el original<input name="resguardo" required placeholder="Ej.: expediente físico en RH" /></label>
                </div>
                <label className="casilla-linea">
                  <input type="checkbox" name="confirmo" /> El documento firmado tiene impreso el folio {folio(e.pendiente.contenido_hash)}
                </label>
              </FormAccion>
            </details>
          )}
        </div>
      )}

      {gestor && e.textoPropuesto && (e.desactualizado || (!e.vigente && !e.pendiente)) && (
        <>
          {(e.vigente || e.pendiente) && (
            <p className="mensaje mensaje-aviso">
              Los datos del trabajador o del centro cambiaron desde el último acuerdo (jornada, descanso, pausa, método de
              registro). Genera una nueva versión para que ambos la firmen.
            </p>
          )}
          <details open={!e.vigente && !e.pendiente}>
            <summary>Revisar y firmar la versión {e.siguienteVersion}</summary>
            <p className="ayuda">
              Plantilla de referencia: revísala con tu abogado laboral antes de usarla. El texto se genera con los datos
              actuales del trabajador y del centro.
            </p>
            <pre className="texto-acuerdo">{e.textoPropuesto}</pre>
            <FormAccion accion={generarYFirmarAcuerdo} boton={`Firmar versión ${e.siguienteVersion} como empresa`}>
              <input type="hidden" name="trabajador_id" value={trabajadorId} />
              <label className="casilla-linea">
                <input type="checkbox" name="confirmo" /> Revisé el texto y lo firmo en representación de {ctx.empresa.razonSocial}
              </label>
            </FormAccion>
          </details>
        </>
      )}
    </>
  );
}
