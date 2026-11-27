import { aHoraLocal } from "@checador/jornada";
import { fecha } from "@/lib/formato";
import { MAXIMO_SIN_COTIZAR, PERSONAS_EN_BASE, BASE_CENTAVOS, pesos, precioMensual } from "@/lib/precios";
import { AdministrarCobro, ContratarCobro } from "./AccionesCobro";

export interface DatosSuscripcion {
  estado: "prueba" | "activa" | "pago_vencido" | "cancelada";
  prueba_hasta: string;
  periodo_fin: string | null;
  pago_vencido_desde: string | null;
  ciclo: "mensual" | "anual";
  suscripcion_externa: string | null;
}

const ESTADO: Record<DatosSuscripcion["estado"], string> = {
  prueba: "Prueba gratis",
  activa: "Activa",
  pago_vencido: "Pago pendiente",
  cancelada: "Cancelada",
};

/**
 * Estado de la suscripción, lo que la empresa paga (o pagaría) con su desglose por tramos y,
 * si el cobro está configurado, contratar con tarjeta o administrar el pago (docs/cobro.md).
 */
export function SeccionSuscripcion({ suscripcion, personas, zonaHoraria, cobroDisponible, aviso }: {
  suscripcion: DatosSuscripcion;
  personas: number;
  zonaHoraria: string;
  cobroDisponible: boolean;
  aviso?: "listo" | "cancelado";
}) {
  const precio = precioMensual(personas);
  const dia = (iso: string) => fecha(aHoraLocal(iso, zonaHoraria).slice(0, 10));
  const dias = Math.ceil((Date.parse(suscripcion.prueba_hasta) - Date.now()) / 864e5);
  const contratada = Boolean(suscripcion.suscripcion_externa) && suscripcion.estado !== "cancelada";
  const enPrueba = suscripcion.estado === "prueba";
  const pruebaTerminada = enPrueba && !contratada && dias <= 0;
  const conPruebaEnStripe = enPrueba && dias > 2; // Stripe pide al menos 48 h de prueba para no cobrar ya

  return (
    <div className="suscripcion">
      <section className="suscripcion-estado">
        <span className={`chip-estado ${pruebaTerminada || suscripcion.estado === "pago_vencido" ? "chip-aviso" : ""}`}>
          {pruebaTerminada ? "Prueba terminada" : ESTADO[suscripcion.estado]}
        </span>

        {aviso === "listo" && (
          <p className="mensaje mensaje-ok" role="status">Listo: registramos tu forma de pago. Puede tardar unos segundos en verse aquí.</p>
        )}
        {aviso === "cancelado" && <p className="mensaje mensaje-aviso" role="status">No se hizo ningún cargo: cancelaste antes de terminar.</p>}

        {enPrueba && !pruebaTerminada && (
          <>
            <p className="suscripcion-dias"><strong>{Math.max(dias, 0)}</strong> {dias === 1 ? "día" : "días"} de prueba</p>
            <p className="ayuda">Hasta el {dia(suscripcion.prueba_hasta)}. Todas las funciones{contratada ? "." : ", sin tarjeta y sin cobro."}</p>
          </>
        )}
        {pruebaTerminada && <p className="ayuda">Terminó el {dia(suscripcion.prueba_hasta)}.</p>}
        {contratada && suscripcion.periodo_fin && (
          <p className="ayuda">
            {enPrueba && `Tarjeta registrada: el primer cobro será el ${dia(suscripcion.periodo_fin)}.`}
            {suscripcion.estado === "activa" && `Próximo cobro: ${dia(suscripcion.periodo_fin)}.`}
            {suscripcion.estado === "pago_vencido" && `Cobro pendiente desde el ${dia(suscripcion.pago_vencido_desde ?? suscripcion.periodo_fin)}.`}
            {" "}Pago {suscripcion.ciclo}.
          </p>
        )}
        {suscripcion.estado === "pago_vencido" && (
          <p className="mensaje mensaje-aviso">No pudimos cobrar con tu tarjeta. Actualízala para que tu cuenta siga al corriente.</p>
        )}

        {!cobroDisponible ? (
          <p className="suscripcion-pago">El pago con tarjeta y la factura (CFDI) estarán disponibles pronto. Mientras tanto no se cobra nada.</p>
        ) : contratada ? (
          <AdministrarCobro texto={suscripcion.estado === "pago_vencido" ? "Actualizar tarjeta" : "Administrar pago y facturas"} />
        ) : precio.cotizar ? (
          <p className="suscripcion-pago">Con más de {MAXIMO_SIN_COTIZAR} personas te preparamos una cotización: escríbenos en <a href="https://jemba.mx">jemba.mx</a>.</p>
        ) : (
          <ContratarCobro
            mensual={pesos(precio.mensualCentavos)}
            anual={pesos(precio.anualCentavos)}
            boton={conPruebaEnStripe ? "Agregar tarjeta" : "Contratar"}
            nota={conPruebaEnStripe
              ? `No se cobra nada hasta el ${dia(suscripcion.prueba_hasta)}. Puedes cancelar cuando quieras desde aquí.`
              : "El primer cobro se hace al contratar. Puedes cancelar cuando quieras desde aquí."}
          />
        )}
      </section>

      <section className="suscripcion-precio" aria-labelledby="titulo-precio">
        <h3 id="titulo-precio">{contratada ? "Con tu personal de hoy pagas" : "Con tu personal de hoy pagarías"}</h3>
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
