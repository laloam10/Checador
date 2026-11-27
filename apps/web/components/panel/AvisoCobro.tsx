import Link from "next/link";
import { aHoraLocal } from "@checador/jornada";
import { fecha } from "@/lib/formato";

export interface SituacionCobro {
  nivel: "ninguna" | "aviso" | "solo_lectura" | "suspendida";
  motivo?: "pago_vencido" | "prueba_terminada" | "cancelada";
  desde?: string;
  solo_lectura_desde?: string;
  suspendida_desde?: string;
}

/**
 * Aviso en todo el panel cuando falta el pago (fase 3 de docs/cobro.md; términos, cláusula 7).
 * Las restricciones las aplica la base de datos; esto solo explica qué pasa y qué hacer.
 */
export function AvisoCobro({ situacion, zonaHoraria, gestor }: { situacion: SituacionCobro; zonaHoraria: string; gestor: boolean }) {
  if (situacion.nivel === "ninguna") return null;
  const dia = (iso?: string) => (iso ? fecha(aHoraLocal(iso, zonaHoraria).slice(0, 10)) : "");
  const { nivel, motivo } = situacion;

  let titulo: string;
  let detalle: string;
  if (nivel === "aviso") {
    titulo = motivo === "prueba_terminada" ? `Tu prueba gratis terminó el ${dia(situacion.desde)}` : "No pudimos cobrar tu suscripción";
    detalle = `${motivo === "prueba_terminada" ? "Agrega una tarjeta para seguir" : "Actualiza tu tarjeta"} antes del ${dia(situacion.solo_lectura_desde)}: ese día el panel quedará en solo lectura. Por ahora todo funciona.`;
  } else if (nivel === "solo_lectura") {
    titulo = "El panel está en solo lectura por falta de pago";
    detalle = `No puedes dar de alta personas, corregir checadas ni generar acuerdos. Tu personal sigue checando hasta el ${dia(situacion.suspendida_desde)}; ese día se suspende el registro.`;
  } else if (motivo === "cancelada") {
    titulo = "Tu suscripción está cancelada";
    detalle = "Tu personal ya no puede checar. Puedes consultar y exportar todos tus registros; para volver a registrar la jornada, contrata de nuevo.";
  } else {
    titulo = "El registro de jornada está suspendido por falta de pago";
    detalle = `Desde el ${dia(situacion.suspendida_desde)} tu personal no puede checar. Tus registros siguen disponibles para consultar y exportar.`;
  }

  return (
    <div className={`aviso-cobro aviso-cobro-${nivel}`} role="alert">
      <div>
        <strong>{titulo}</strong>
        <p>{detalle}{!gestor && " Avisa al propietario de la cuenta."}</p>
      </div>
      {gestor && (
        <Link href="/panel/configuracion#suscripcion" className="boton">
          {motivo === "cancelada" ? "Contratar" : motivo === "prueba_terminada" ? "Agregar tarjeta" : "Actualizar forma de pago"}
        </Link>
      )}
    </div>
  );
}
