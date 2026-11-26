import { aHoraLocal } from "@checador/jornada";
import { fecha } from "@/lib/formato";
import { MAXIMO_SIN_COTIZAR, PERSONAS_EN_BASE, BASE_CENTAVOS, pesos, precioMensual } from "@/lib/precios";

export interface DatosSuscripcion {
  estado: "prueba" | "activa" | "pago_vencido" | "cancelada";
  prueba_hasta: string;
  periodo_fin: string | null;
}

const ESTADO: Record<DatosSuscripcion["estado"], string> = {
  prueba: "Prueba gratis",
  activa: "Activa",
  pago_vencido: "Pago pendiente",
  cancelada: "Cancelada",
};

/**
 * Estado de la suscripción y lo que la empresa pagaría este mes, con el desglose por tramos.
 * Fase 1: solo informa (el pago en línea llega en la fase 2; ver docs/cobro.md).
 */
export function SeccionSuscripcion({ suscripcion, personas, zonaHoraria }: { suscripcion: DatosSuscripcion; personas: number; zonaHoraria: string }) {
  const precio = precioMensual(personas);
  const finPrueba = aHoraLocal(suscripcion.prueba_hasta, zonaHoraria).slice(0, 10);
  const dias = Math.ceil((Date.parse(suscripcion.prueba_hasta) - Date.now()) / 864e5);
  const enPrueba = suscripcion.estado === "prueba";
  const pruebaTerminada = enPrueba && dias <= 0;

  return (
    <div className="suscripcion">
      <section className="suscripcion-estado">
        <span className={`chip-estado ${pruebaTerminada ? "chip-aviso" : ""}`}>{pruebaTerminada ? "Prueba terminada" : ESTADO[suscripcion.estado]}</span>
        {enPrueba && !pruebaTerminada && (
          <>
            <p className="suscripcion-dias"><strong>{dias}</strong> {dias === 1 ? "día" : "días"} de prueba</p>
            <p className="ayuda">Hasta el {fecha(finPrueba)}. Todas las funciones, sin tarjeta y sin cobro.</p>
          </>
        )}
        {pruebaTerminada && <p className="ayuda">Terminó el {fecha(finPrueba)}. Puedes seguir usando Checador mientras habilitamos el pago en línea.</p>}
        <p className="suscripcion-pago">
          El pago con tarjeta y la factura (CFDI) estarán disponibles pronto. Mientras tanto no se cobra nada.
        </p>
      </section>

      <section className="suscripcion-precio" aria-labelledby="titulo-precio">
        <h3 id="titulo-precio">Con tu personal de hoy pagarías</h3>
        {precio.cotizar ? (
          <>
            <p className="suscripcion-total">Cotización</p>
            <p className="ayuda">
              Tienes {personas} personas activas. Con más de {MAXIMO_SIN_COTIZAR} te preparamos una cotización: escríbenos en{" "}
              <a href="https://jemba.mx">jemba.mx</a>.
            </p>
          </>
        ) : (
          <>
            <p className="suscripcion-total">{pesos(precio.mensualCentavos)}<span> al mes + IVA</span></p>
            <p className="ayuda">
              {pesos(precio.mensualConIvaCentavos)} con IVA · o {pesos(precio.anualCentavos)} al año + IVA (2 meses de regalo)
            </p>
            <table className="suscripcion-desglose" aria-label="Desglose por tramos">
              <tbody>
                <tr>
                  <th scope="row">Hasta {PERSONAS_EN_BASE} personas</th>
                  <td>{pesos(BASE_CENTAVOS)}</td>
                </tr>
                {precio.renglones.map((r) => (
                  <tr key={r.desde}>
                    <th scope="row">{r.personas} {r.personas === 1 ? "persona" : "personas"} × {pesos(r.porPersonaCentavos)} <small>(de la {r.desde}.ª a la {r.hasta}.ª)</small></th>
                    <td>{pesos(r.subtotalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="ayuda suscripcion-nota">
          {personas} {personas === 1 ? "persona trabajadora activa" : "personas trabajadoras activas"}. Solo cuentan ellas: el dueño, los administradores,
          los supervisores y los kioscos no tienen costo. Si das de alta o de baja a alguien, el cobro se ajusta por los días.
        </p>
      </section>
    </div>
  );
}
