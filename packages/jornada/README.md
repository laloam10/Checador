# @checador/jornada

Motor de cálculo de jornada ordinaria y tiempo extraordinario conforme a la LFT (reforma DOF 01-05-2026). Es TypeScript puro y no depende de la base de datos ni de la interfaz.

```bash
npm test          # pruebas
npm run typecheck # revisión de tipos
```

## Uso

```ts
import { calcularSemana, pagoTiempoExtraCentavos } from "@checador/jornada";

const r = calcularSemana(
  "2027-01-04", // primer día de la semana
  [{ inicio: "2027-01-04T07:00", fin: "2027-01-04T17:00" }],
  { diaDescanso: 0 },
);
r.totales;     // { trabajadoMin, ordinariaMin, extraDobleMin, extraTripleMin }
r.alertas;     // incumplimientos con su fundamento legal
pagoTiempoExtraCentavos(r, 5000); // salario de $50.00/h
```

## Reglas implementadas

| Regla | Fundamento |
|---|---|
| Jornada semanal máxima de 48, 46, 44, 42 o 40 h según el año | Art. 59, transitorio 2.º |
| Jornada diaria de 8 h diurna, 7 h nocturna y 7.5 h mixta | Art. 61 |
| Clasificación diurna, nocturna o mixta (nocturna si tiene 3.5 h o más de periodo nocturno) | Art. 60 |
| Las pausas en que el trabajador no puede salir cuentan como jornada | Art. 64 |
| Tiempo extra al doble: tope semanal de 9, 9, 10, 11 o 12 h según el año; máximo 4 h diarias y 4 días | Art. 66, transitorio 4.º |
| Tiempo extra que excede el art. 66: al triple, hasta 4 h por semana | Art. 68, 2.º párr. |
| Alertas: más de 12 h en un día, triple por encima del máximo, 7 días sin descanso, trabajo en el descanso obligatorio o en uno adicional pactado, trabajo en domingo, pacto mayor al máximo semanal | Arts. 68, 69, 71, 73 y 59 |

## Interpretaciones que debe validar un abogado

Son decisiones del motor que la ley no resuelve de forma literal:

1. **Distribución pactada (art. 58, 2.º párr.):** si se pacta, el límite diario es el pactado aunque supere el del art. 61; por ejemplo, 9.6 h de lunes a viernes para descansar el sábado. Sin pacto, aplica el art. 61.
2. **Exceso semanal:** si la jornada ordinaria acumulada supera el máximo del año, el excedente se vuelve tiempo extra **empezando por los últimos días de la semana**.
3. **Asignación de horas al doble:** en orden cronológico. Un 5.º día con tiempo extra va por completo al triple, aunque quede saldo del tope semanal.
4. **Semana que cruza de un año a otro:** se aplican la menor jornada y el menor tope de horas al doble de los dos años (art. 18, interpretación más favorable al trabajador).
5. **Turnos nocturnos:** se atribuyen al día en que inician. El tipo de jornada se clasifica con el turno completo, incluidas las pausas.
6. **Exceso sobre el límite legal:** se reporta al triple y genera alerta. La ley prohíbe ese exceso, pero las horas trabajadas deben pagarse igual.
7. **Más de un día de descanso:** el art. 69 exige un día por cada seis de trabajo. El empleador marca cuál es el **descanso semanal obligatorio**; trabajarlo genera la alerta del art. 73 (salario doble). Los **días adicionales pactados** (p. ej., el sábado en una semana de 5 días) son un beneficio del contrato: trabajarlos genera una alerta distinta que no afirma el pago doble, y sus horas cuentan para el máximo semanal como cualquier otra.

## Fuera de alcance (por ahora)

- Descanso mínimo de media hora en jornada continua (art. 63): la ley no define a partir de cuántas horas aplica.
- Cálculo del monto de la prima dominical y del pago por trabajar en el día de descanso: solo se generan alertas.
- Fechas anteriores al 2026-05-01: el motor las rechaza.
