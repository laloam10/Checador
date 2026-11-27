import { aceptarDocumentosLegales } from "@/app/panel/acciones";
import { FormAccion } from "./FormAccion";

/**
 * Pide al propietario aceptar los términos y el aviso de privacidad vigentes cuando su empresa
 * no los ha aceptado (empresas anteriores a su publicación, o una versión nueva).
 * Ver docs/legal/README.md.
 */
export function AvisoLegal({ terminos, privacidad }: { terminos: string; privacidad: string }) {
  return (
    <div className="aviso-cobro aviso-legal" role="region" aria-label="Términos del servicio">
      <div>
        <strong>Revisa y acepta los términos de Checador</strong>
        <p>
          Publicamos los <a href="/terminos" target="_blank" rel="noopener">Términos del servicio</a> (versión {terminos}) y
          el <a href="/privacidad" target="_blank" rel="noopener">Aviso de privacidad</a> (versión {privacidad}). Tu
          aceptación queda registrada con la fecha y tu cuenta.
        </p>
      </div>
      <FormAccion accion={aceptarDocumentosLegales} boton="Acepto" className="form-plano aviso-legal-form">
        <></>
      </FormAccion>
    </div>
  );
}
