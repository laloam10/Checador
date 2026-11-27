import { fecha } from "@/lib/formato";

export interface AvisoCambio {
  id: number;
  tipo: "precio" | "terminos" | "privacidad";
  vigente_desde: string;
  resumen: string;
  enlace: string | null;
}

const QUE = {
  precio: "cambia el precio de Checador",
  terminos: "cambian los términos del servicio",
  privacidad: "cambia el aviso de privacidad",
} as const;

/**
 * Cambios próximos de precio, términos o aviso de privacidad (términos 6.6 y 15: se avisan con
 * al menos 30 días por correo y en el panel). Se muestran hasta el día en que entran en vigor.
 * Los publica Jemba con avisar_cambio_a_clientes() (docs/cobro.md).
 */
export function AvisoCambios({ avisos }: { avisos: AvisoCambio[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="aviso-cobro aviso-cambios" role="region" aria-label="Cambios próximos">
      <div>
        {avisos.map((a) => (
          <div key={a.id} className="aviso-cambio">
            <strong>A partir del {fecha(a.vigente_desde)} {QUE[a.tipo]}</strong>
            <p>
              {a.resumen}
              {a.enlace && (
                <>
                  {" "}
                  <a href={a.enlace} target="_blank" rel="noopener">Ver el detalle</a>
                </>
              )}
            </p>
          </div>
        ))}
        {avisos.some((a) => a.tipo !== "privacidad") && (
          <p className="aviso-cambios-pie">Si no estás de acuerdo, puedes cancelar antes de esa fecha en Configuración → Suscripción.</p>
        )}
      </div>
    </div>
  );
}
