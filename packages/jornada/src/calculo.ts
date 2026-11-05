import {
  JORNADA_DIARIA_ART61_MIN,
  MAX_DIAS_EXTRA_DOBLE_SEMANA,
  MAX_EXTRA_DOBLE_DIARIO_MIN,
  MAX_EXTRA_TRIPLE_SEMANAL_MIN,
  MAX_TOTAL_DIARIO_MIN,
  jornadaSemanalMaxMin,
  topeExtraSemanalMin,
} from "./limites";
import {
  aMinutos,
  anioDe,
  diaSemana,
  fechaDe,
  minutosNocturnos,
  sumarDias,
} from "./tiempo";
import type {
  Alerta,
  ConfigTrabajador,
  FechaLocal,
  ResultadoDia,
  ResultadoSemana,
  TipoJornada,
  Turno,
} from "./tipos";

const MIN_NOCTURNOS_PARA_NOCTURNA = 3 * 60 + 30; // art. 60, 3.er párr.
const ORDEN_RIGOR: Record<TipoJornada, number> = { diurna: 0, mixta: 1, nocturna: 2 };

/** Art. 60: clasifica un intervalo como jornada diurna, nocturna o mixta. */
export function clasificarJornada(inicio: number, fin: number): TipoJornada {
  const nocturnos = minutosNocturnos(inicio, fin);
  if (nocturnos === 0) return "diurna";
  if (nocturnos === fin - inicio || nocturnos >= MIN_NOCTURNOS_PARA_NOCTURNA) return "nocturna";
  return "mixta";
}

/** Minutos efectivos de un turno: duración menos pausas en que sí puede salir (art. 64). */
export function minutosEfectivos(turno: Turno): number {
  const ini = aMinutos(turno.inicio);
  const fin = aMinutos(turno.fin);
  if (fin <= ini) throw new RangeError(`El turno ${turno.inicio} → ${turno.fin} termina antes de iniciar.`);
  if (fin - ini > 24 * 60) throw new RangeError(`El turno ${turno.inicio} → ${turno.fin} dura más de 24 h.`);
  let descuento = 0;
  for (const p of turno.pausas ?? []) {
    const pi = aMinutos(p.inicio);
    const pf = aMinutos(p.fin);
    if (pf <= pi || pi < ini || pf > fin) {
      throw new RangeError(`La pausa ${p.inicio} → ${p.fin} no está dentro del turno.`);
    }
    if (p.puedeSalir) descuento += pf - pi;
  }
  return fin - ini - descuento;
}

interface DiaAcumulado {
  fecha: FechaLocal;
  trabajado: number;
  tipo: TipoJornada;
}

/**
 * Calcula jornada ordinaria y tiempo extraordinario de una semana.
 *
 * Reglas (ver docs/analisis-legal.md, sección 5.4):
 * 1. Cada turno se atribuye al día en que inicia.
 * 2. Ordinaria diaria = mínimo entre lo trabajado y la jornada pactada para ese día
 *    (art. 58) o, en su defecto, el límite del art. 61 según el tipo de jornada.
 * 3. Si la ordinaria semanal excede el máximo del año (art. 59 y transitorio 2.º),
 *    el excedente se reclasifica como extra, empezando por los últimos días.
 * 4. Extra en orden cronológico: al doble (art. 66) hasta el tope semanal del año,
 *    con máximo 4 h por día y 4 días; el resto, al triple (art. 68).
 * 5. Si la semana abarca dos años, se aplican los límites más favorables a la
 *    persona trabajadora (art. 18): la menor jornada y el menor tope al doble.
 */
export function calcularSemana(
  inicioSemana: FechaLocal,
  turnos: readonly Turno[],
  config: ConfigTrabajador,
): ResultadoSemana {
  const finSemana = sumarDias(inicioSemana, 7);
  const fechasSemana = Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana, i));
  const anios = [...new Set(fechasSemana.map(anioDe))];
  const maxSemanal = Math.min(...anios.map(jornadaSemanalMaxMin));
  const topeDoble = Math.min(...anios.map(topeExtraSemanalMin));

  // 1. Acumular por día.
  const porDia = new Map<FechaLocal, DiaAcumulado>();
  for (const t of turnos) {
    const fecha = fechaDe(t.inicio);
    if (fecha < inicioSemana || fecha >= finSemana) {
      throw new RangeError(`El turno ${t.inicio} no pertenece a la semana que inicia ${inicioSemana}.`);
    }
    const tipo = clasificarJornada(aMinutos(t.inicio), aMinutos(t.fin));
    const previo = porDia.get(fecha);
    const efectivo = minutosEfectivos(t);
    if (previo) {
      previo.trabajado += efectivo;
      if (ORDEN_RIGOR[tipo] > ORDEN_RIGOR[previo.tipo]) previo.tipo = tipo;
    } else {
      porDia.set(fecha, { fecha, trabajado: efectivo, tipo });
    }
  }

  const dias: ResultadoDia[] = [...porDia.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => {
      const dow = diaSemana(d.fecha);
      const limite = config.jornadaPactadaMin?.[dow] ?? JORNADA_DIARIA_ART61_MIN[d.tipo];
      const ordinaria = Math.min(d.trabajado, limite);
      return {
        fecha: d.fecha,
        diaSemana: dow,
        tipo: d.tipo,
        trabajadoMin: d.trabajado,
        ordinariaMin: ordinaria,
        extraDobleMin: 0,
        extraTripleMin: 0,
      };
    });

  // 2. Excedente diario y reclasificación semanal.
  const extraPorDia = dias.map((d) => d.trabajadoMin - d.ordinariaMin);
  let excedenteSemanal = dias.reduce((s, d) => s + d.ordinariaMin, 0) - maxSemanal;
  for (let i = dias.length - 1; i >= 0 && excedenteSemanal > 0; i--) {
    const d = dias[i]!;
    const mover = Math.min(d.ordinariaMin, excedenteSemanal);
    d.ordinariaMin -= mover;
    extraPorDia[i]! += mover;
    excedenteSemanal -= mover;
  }

  // 3. Clasificar extra en doble / triple, en orden cronológico.
  let dobleRestante = topeDoble;
  let diasConDoble = 0;
  dias.forEach((d, i) => {
    const extra = extraPorDia[i]!;
    if (extra === 0) return;
    let doble = 0;
    if (diasConDoble < MAX_DIAS_EXTRA_DOBLE_SEMANA) {
      doble = Math.min(extra, MAX_EXTRA_DOBLE_DIARIO_MIN, dobleRestante);
    }
    if (doble > 0) diasConDoble++;
    dobleRestante -= doble;
    d.extraDobleMin = doble;
    d.extraTripleMin = extra - doble;
  });

  const totales = {
    trabajadoMin: sum(dias.map((d) => d.trabajadoMin)),
    ordinariaMin: sum(dias.map((d) => d.ordinariaMin)),
    extraDobleMin: sum(dias.map((d) => d.extraDobleMin)),
    extraTripleMin: sum(dias.map((d) => d.extraTripleMin)),
  };

  return {
    inicioSemana,
    jornadaSemanalMaxMin: maxSemanal,
    topeExtraDobleMin: topeDoble,
    dias,
    totales,
    alertas: generarAlertas(dias, totales.extraTripleMin, config, maxSemanal),
  };
}

function generarAlertas(
  dias: ResultadoDia[],
  tripleTotal: number,
  config: ConfigTrabajador,
  maxSemanal: number,
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const d of dias) {
    if (d.trabajadoMin > MAX_TOTAL_DIARIO_MIN) {
      alertas.push({
        codigo: "DIA_EXCEDE_12H",
        fundamento: "LFT art. 68, 3.er párr.",
        mensaje: "La suma de jornada ordinaria y extraordinaria excede 12 horas en el día.",
        fecha: d.fecha,
        minutos: d.trabajadoMin - MAX_TOTAL_DIARIO_MIN,
      });
    }
    if (d.diaSemana === config.diaDescanso) {
      alertas.push({
        codigo: "TRABAJO_EN_DIA_DESCANSO",
        fundamento: "LFT art. 73",
        mensaje: "Se trabajó en el día de descanso: corresponde salario doble además del salario del descanso.",
        fecha: d.fecha,
        minutos: d.trabajadoMin,
      });
    }
    if (d.diaSemana === 0) {
      alertas.push({
        codigo: "TRABAJO_EN_DOMINGO",
        fundamento: "LFT art. 71, 2.º párr.",
        mensaje: "Se trabajó en domingo: corresponde prima dominical de al menos 25%.",
        fecha: d.fecha,
        minutos: d.trabajadoMin,
      });
    }
  }

  if (tripleTotal > MAX_EXTRA_TRIPLE_SEMANAL_MIN) {
    alertas.push({
      codigo: "EXTRA_EXCEDE_LIMITE_LEGAL",
      fundamento: "LFT art. 68, 2.º párr.",
      mensaje:
        "El tiempo extraordinario excede el máximo permitido (tope del art. 66 más 4 h). " +
        "Las horas se reportan al triple, pero el exceso constituye un incumplimiento.",
      minutos: tripleTotal - MAX_EXTRA_TRIPLE_SEMANAL_MIN,
    });
  }

  if (dias.length === 7) {
    alertas.push({
      codigo: "SIN_DESCANSO_SEMANAL",
      fundamento: "LFT art. 69",
      mensaje: "Se trabajaron los 7 días de la semana sin día de descanso.",
    });
  }

  const pactado = config.jornadaPactadaMin;
  if (pactado) {
    const totalPactado = sum(Object.values(pactado).map((v) => v ?? 0));
    if (totalPactado > maxSemanal) {
      alertas.push({
        codigo: "PACTO_EXCEDE_MAXIMO_SEMANAL",
        fundamento: "LFT art. 59 y transitorio 2.º del decreto DOF 01-05-2026",
        mensaje: "La jornada pactada excede la jornada ordinaria máxima semanal vigente.",
        minutos: totalPactado - maxSemanal,
      });
    }
  }

  return alertas;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * Pago de tiempo extraordinario en centavos.
 * Doble = salario por hora + 100% (art. 66); triple = salario por hora + 200% (art. 68).
 * Se redondea al centavo al final para no acumular errores.
 */
export function pagoTiempoExtraCentavos(
  resultado: Pick<ResultadoSemana, "totales">,
  salarioHoraCentavos: number,
): { dobleCentavos: number; tripleCentavos: number; totalCentavos: number } {
  if (!Number.isInteger(salarioHoraCentavos) || salarioHoraCentavos < 0) {
    throw new RangeError("salarioHoraCentavos debe ser un entero no negativo.");
  }
  const doble = Math.round((resultado.totales.extraDobleMin * salarioHoraCentavos * 2) / 60);
  const triple = Math.round((resultado.totales.extraTripleMin * salarioHoraCentavos * 3) / 60);
  return { dobleCentavos: doble, tripleCentavos: triple, totalCentavos: doble + triple };
}

