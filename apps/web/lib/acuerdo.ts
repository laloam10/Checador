/**
 * Plantilla del acuerdo de registro electrónico de jornada (LFT art. 132 fr. XXXIV).
 *
 * IMPORTANTE: es una plantilla de referencia. Debe revisarla un abogado laboralista
 * antes de usarse con clientes. Cualquier cambio de redacción debe incrementar
 * PLANTILLA_VERSION para que el panel detecte que los acuerdos firmados quedaron
 * desactualizados.
 *
 * Decisiones de redacción:
 *  - No hay aceptación tácita: el silencio del trabajador NO implica conformidad
 *    (una cláusula así podría considerarse renuncia de derechos, arts. 5 y 33 LFT).
 *  - Se declara qué datos personales se recaban y que no hay biometría ni ubicación.
 *  - El registro original nunca se modifica: las correcciones quedan visibles.
 */

export const PLANTILLA_VERSION = "1";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface DatosAcuerdo {
  version: number;
  fecha: string; // YYYY-MM-DD, fecha de generación (hora local del centro)
  empresa: { razonSocial: string; rfc: string | null };
  centro: { nombre: string; direccion: string | null; pausaPuedeSalir: boolean };
  trabajador: {
    nombre: string;
    numeroEmpleado: string | null;
    curp: string | null;
    email: string | null;
    diaDescanso: number;
    jornadaPactadaMin: Record<string, number> | null;
  };
}

function horas(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function fechaLarga(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d} de ${meses[m - 1]} de ${a}`;
}

export function generarTextoAcuerdo(d: DatosAcuerdo): string {
  const t = d.trabajador;
  const identificacion = [
    t.numeroEmpleado ? `número de empleado ${t.numeroEmpleado}` : null,
    t.curp ? `CURP ${t.curp}` : null,
  ].filter(Boolean).join(", ");

  const metodos: string[] = [];
  if (t.email) {
    metodos.push(
      `a) Aplicación web en su teléfono celular, a la que accede con el correo electrónico ${t.email} y un código de un solo uso enviado a ese correo.`,
    );
  }
  if (t.numeroEmpleado) {
    metodos.push(
      `${metodos.length ? "b" : "a"}) Kiosco instalado en el centro de trabajo, con su número de empleado ${t.numeroEmpleado} y un PIN personal, confidencial e intransferible.`,
    );
  }
  if (!metodos.length) metodos.push("a) Captura en el sistema por parte de la persona empleadora, con el motivo de cada registro.");

  const pactada = t.jornadaPactadaMin && Object.keys(t.jornadaPactadaMin).length
    ? [1, 2, 3, 4, 5, 6, 0]
        .filter((dia) => t.jornadaPactadaMin![String(dia)] != null)
        .map((dia) => `${DIAS[dia]}: ${horas(t.jornadaPactadaMin![String(dia)]!)}`)
        .join("; ")
    : null;

  return `ACUERDO PARA EL REGISTRO ELECTRÓNICO DE LA JORNADA DE TRABAJO
Versión ${d.version} · Plantilla ${PLANTILLA_VERSION} · ${fechaLarga(d.fecha)}

Que celebran, por una parte, ${d.empresa.razonSocial}${d.empresa.rfc ? `, con RFC ${d.empresa.rfc}` : ""}, en lo sucesivo "la persona empleadora", y por la otra, ${t.nombre}${identificacion ? `, con ${identificacion}` : ""}, en lo sucesivo "la persona trabajadora", con fundamento en el artículo 132, fracción XXXIV, de la Ley Federal del Trabajo, respecto del centro de trabajo ${d.centro.nombre}${d.centro.direccion ? `, ubicado en ${d.centro.direccion}` : ""}.

CLÁUSULAS

PRIMERA. Objeto. Las partes acuerdan el método y las reglas para registrar de manera electrónica la jornada laboral de la persona trabajadora, incluido el horario de inicio y de finalización, en términos del artículo 132, fracción XXXIV, de la Ley Federal del Trabajo.

SEGUNDA. Método de registro. La jornada se registrará en el sistema electrónico "Checador" mediante:
${metodos.join("\n")}
Se registran el inicio y el fin de la jornada y de las pausas. La hora de cada registro la fija el servidor del sistema. Cuando un registro se haga sin conexión a internet, se conservarán tanto la hora del dispositivo como la hora en que llegó al servidor, y el registro quedará identificado como hecho sin conexión.

TERCERA. Jornada. ${pactada
    ? `Las partes acuerdan la siguiente distribución de la jornada ordinaria (artículo 58 de la Ley Federal del Trabajo): ${pactada}.`
    : "La jornada ordinaria diaria será la prevista en el artículo 61 de la Ley Federal del Trabajo según su tipo (diurna, nocturna o mixta)."} En ningún caso la jornada ordinaria excederá el máximo semanal vigente conforme a la ley y a sus disposiciones transitorias. El día de descanso semanal será el ${DIAS[t.diaDescanso]}.

CUARTA. Pausas. ${d.centro.pausaPuedeSalir
    ? "Durante la pausa para reposo o comida la persona trabajadora puede salir del centro de trabajo; ese tiempo no se computa como jornada."
    : "Durante la pausa para reposo o comida la persona trabajadora no puede salir del centro de trabajo; ese tiempo se computa como tiempo efectivo de la jornada, conforme al artículo 64 de la Ley Federal del Trabajo."}

QUINTA. Tiempo extraordinario. El tiempo que exceda la jornada ordinaria se registrará y se pagará conforme a los artículos 66, 67 y 68 de la Ley Federal del Trabajo.

SEXTA. Correcciones. La persona empleadora podrá registrar correcciones, anulaciones o registros faltantes, siempre indicando el motivo. Ninguna corrección modifica ni elimina el registro original, que se conserva junto con la fecha, la hora y la cuenta de quien hizo la corrección. Las correcciones serán visibles para la persona trabajadora.

SÉPTIMA. Consulta y conformidad. La persona trabajadora puede consultar sus registros en todo momento y manifestar, por cada semana, su conformidad o su objeción. La falta de manifestación no implica conformidad. Una objeción no impide que posteriormente manifieste su conformidad una vez atendida.

OCTAVA. Integridad y conservación. Los registros se almacenan de forma que cualquier alteración posterior sea detectable. Se conservarán al menos durante la relación de trabajo y un año después de su terminación, conforme al artículo 804 de la Ley Federal del Trabajo, y se proporcionarán a la autoridad cuando lo requiera.

NOVENA. Datos personales. Para este registro se tratan: nombre, número de empleado, correo electrónico, horarios registrados y, por cada registro, la dirección IP y el tipo de dispositivo. No se recaban datos biométricos ni de ubicación. La finalidad es cumplir las obligaciones laborales de la persona empleadora. El tratamiento se rige por el aviso de privacidad de la persona empleadora.

DÉCIMA. Derechos irrenunciables. Nada de lo previsto en este acuerdo implica renuncia de derechos de la persona trabajadora, en términos de los artículos 5 y 33 de la Ley Federal del Trabajo, ni limita las pruebas que pueda ofrecer.

DÉCIMA PRIMERA. Vigencia. Este acuerdo surte efectos a partir de que lo firmen ambas partes y estará vigente hasta que ambas firmen una versión posterior.`;
}

/** Folio corto que se imprime junto al acuerdo (primeros 12 caracteres del SHA-256). */
export function folio(hashHex: string) {
  return hashHex.replace(/^\\x/, "").slice(0, 12);
}
