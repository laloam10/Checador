/**
 * Precio de Checador: escalonado por persona trabajadora activa (docs/cobro.md).
 * Cada tramo solo se aplica a las personas que caen en él (como los impuestos), así que
 * agregar a una persona nunca cuesta más que el precio de su tramo: no hay saltos.
 *
 *   Hasta 2 personas: $199 al mes (fijo).
 *   De la 3.ª a la 10.ª: $50 por persona.
 *   De la 11.ª a la 40.ª: $30 por persona.
 *   Más de 40: cotización.
 *
 * Dinero en centavos (CLAUDE.md). Precios más IVA. Anual = 10 meses (2 de regalo).
 * Usuarios del panel (dueño, administradores, supervisores) y kioscos no cuentan.
 */
export const BASE_CENTAVOS = 19900;
export const PERSONAS_EN_BASE = 2;
export const TRAMOS = [
  { desde: 3, hasta: 10, porPersonaCentavos: 5000 },
  { desde: 11, hasta: 40, porPersonaCentavos: 3000 },
] as const;
export const MAXIMO_SIN_COTIZAR = 40;
export const IVA = 0.16;
export const MESES_PAGADOS_AL_AÑO = 10;

export interface RenglonPrecio {
  desde: number;
  hasta: number;
  personas: number;
  porPersonaCentavos: number;
  subtotalCentavos: number;
}

export interface Precio {
  personas: number;
  /** Más de 40 personas: el precio se cotiza (los renglones cubren solo hasta 40). */
  cotizar: boolean;
  renglones: RenglonPrecio[];
  mensualCentavos: number;
  ivaCentavos: number;
  mensualConIvaCentavos: number;
  anualCentavos: number;
}

export function precioMensual(personasActivas: number): Precio {
  const personas = Math.max(0, Math.floor(personasActivas));
  const renglones: RenglonPrecio[] = [];
  for (const t of TRAMOS) {
    const enTramo = Math.max(0, Math.min(personas, t.hasta) - t.desde + 1);
    if (enTramo > 0) {
      renglones.push({ desde: t.desde, hasta: t.hasta, personas: enTramo, porPersonaCentavos: t.porPersonaCentavos, subtotalCentavos: enTramo * t.porPersonaCentavos });
    }
  }
  const mensualCentavos = BASE_CENTAVOS + renglones.reduce((s, r) => s + r.subtotalCentavos, 0);
  const ivaCentavos = Math.round(mensualCentavos * IVA);
  return {
    personas,
    cotizar: personas > MAXIMO_SIN_COTIZAR,
    renglones,
    mensualCentavos,
    ivaCentavos,
    mensualConIvaCentavos: mensualCentavos + ivaCentavos,
    anualCentavos: mensualCentavos * MESES_PAGADOS_AL_AÑO,
  };
}

/** "$1,499" o "$694.84" (pesos mexicanos; sin decimales si son exactos). */
export function pesos(centavos: number): string {
  const exacto = centavos % 100 === 0;
  return `$${(centavos / 100).toLocaleString("en-US", { minimumFractionDigits: exacto ? 0 : 2, maximumFractionDigits: 2 })}`;
}
