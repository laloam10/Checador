/** Art. 60. */
export type TipoJornada = "diurna" | "nocturna" | "mixta";

/** 0 = domingo … 6 = sábado. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Fecha y hora local del centro de trabajo, formato `YYYY-MM-DDTHH:mm`.
 * Sin zona horaria: México no aplica horario de verano desde 2022 (salvo franja
 * fronteriza), y el registro debe reflejar la hora local del centro de trabajo.
 */
export type FechaHoraLocal = string;

/** Fecha local, formato `YYYY-MM-DD`. */
export type FechaLocal = string;

export interface Pausa {
  inicio: FechaHoraLocal;
  fin: FechaHoraLocal;
  /**
   * Art. 64: si la persona trabajadora NO puede salir del lugar durante la pausa,
   * ese tiempo se computa como tiempo efectivo de jornada.
   */
  puedeSalir: boolean;
}

/** Un turno registrado (entrada y salida). Se atribuye al día en que inicia. */
export interface Turno {
  inicio: FechaHoraLocal;
  fin: FechaHoraLocal;
  pausas?: Pausa[];
}

export interface ConfigTrabajador {
  /** Día de descanso semanal pactado (arts. 69 y 70). */
  diaDescanso: DiaSemana;
  /**
   * Distribución pactada de la jornada ordinaria por día de la semana, en minutos
   * (art. 58, 2.º párr.). Si se omite un día, se usa el límite del art. 61
   * según el tipo de jornada de ese día.
   */
  jornadaPactadaMin?: Partial<Record<DiaSemana, number>>;
}

export type CodigoAlerta =
  | "DIA_EXCEDE_12H"
  | "EXTRA_EXCEDE_LIMITE_LEGAL"
  | "SIN_DESCANSO_SEMANAL"
  | "TRABAJO_EN_DIA_DESCANSO"
  | "TRABAJO_EN_DOMINGO"
  | "PACTO_EXCEDE_MAXIMO_SEMANAL";

export interface Alerta {
  codigo: CodigoAlerta;
  /** Fundamento legal. */
  fundamento: string;
  mensaje: string;
  fecha?: FechaLocal;
  minutos?: number;
}

export interface ResultadoDia {
  fecha: FechaLocal;
  diaSemana: DiaSemana;
  tipo: TipoJornada;
  trabajadoMin: number;
  ordinariaMin: number;
  extraDobleMin: number;
  extraTripleMin: number;
}

export interface ResultadoSemana {
  inicioSemana: FechaLocal;
  jornadaSemanalMaxMin: number;
  topeExtraDobleMin: number;
  dias: ResultadoDia[];
  totales: {
    trabajadoMin: number;
    ordinariaMin: number;
    extraDobleMin: number;
    extraTripleMin: number;
  };
  alertas: Alerta[];
}
