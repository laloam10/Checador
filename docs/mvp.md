# MVP: alcance propuesto

> Propuesta inicial. Depende de cerrar las preguntas abiertas de [analisis-legal.md](analisis-legal.md).

## Tesis del producto

Cumplir la ley solo con un registro electrónico es barato: una hoja de cálculo o una app gratuita pueden alcanzar. Lo que una PYME necesita, y por lo que puede pagar, es **un registro que la defienda en una inspección o un juicio laboral**, con el menor esfuerzo de operación posible.

El texto oficial lo respalda. El art. 132 fr. XXXIV dice que el registro **"hará prueba plena si se acredita que fue acordado entre la persona trabajadora y empleadora"**. El diferenciador es **producir y documentar ese acuerdo**, no "checar".

Propuesta de valor: *"Registro de jornada con conformidad del trabajador: prueba plena, listo para inspección, sin hardware."*

## Dentro del MVP

| Función | Fundamento (ver [analisis-legal.md](analisis-legal.md)) |
|---|---|
| Alta de empresa, centros de trabajo y trabajadores con su jornada pactada (diurna, nocturna o mixta) y su distribución | Arts. 58, 60, 61 |
| Registro de inicio, fin y pausas desde el celular o un kiosco web, con hora del servidor | Art. 132 XXXIV; arts. 63 y 64 |
| **Acuerdo inicial** firmado electrónicamente sobre el método de registro y la jornada | Art. 132 XXXIV, 3.er párr. (prueba plena) |
| **Conformidad periódica** del trabajador con sus registros, y flujo de objeción | Art. 132 XXXIV, 3.er párr. |
| Bitácora de auditoría inmutable: las correcciones exigen motivo y guardan el valor anterior | Valor probatorio; arts. 784 y 805 |
| Motor de cálculo con la tabla de transición 2026 a 2030: horas extra dobles o triples y alertas por exceder 4 h diarias, 4 días o 12 h diarias | Arts. 59, 66, 68; transitorios 2.º y 4.º |
| Exportación PDF/CSV por trabajador y periodo, con hash de integridad, para inspección o juicio | Art. 132 XXXIV ("proporcionarlo a la autoridad"); art. 804 |
| Retención: nunca borrar al dar de baja; conservar al menos 1 año después de la baja | Art. 804, último párr. |
| Aviso de privacidad y recolección mínima de datos (sin biometría en el MVP) | Ley de datos personales |

## Fuera del MVP (y por qué)

- **Biometría (rostro o huella):** la ley no la exige y aumenta el riesgo bajo la LFPDPPP. Se puede evaluar después como opción con consentimiento expreso.
- **Geocerca obligatoria:** la ley no la exige y es invasiva. Quedaría como opción por centro de trabajo.
- **Nómina y CFDI:** es otro producto y tiene mucha competencia. Se cubre con una integración por exportación.
- **Hardware propio:** sube el costo y la logística.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las disposiciones de la STPS (entran en vigor el 1 de enero de 2027 y aún no se publican) cambian requisitos técnicos | Diseño modular. No prometer "certificado" ni "100% cumplimiento" |
| La STPS exime a las microempresas y se reduce el mercado obligado | Vender el valor probatorio (que aplica a todas) y el cálculo de horas extra, no solo la obligación |
| Prometer multas inmediatas cuando la exigibilidad práctica es en 2027 | Comunicación honesta: 2026 es el periodo de ajuste (transitorio 3.º) |
| Mercado con competidores ya establecidos (Factorial, Checkingo, Linkit, entre otros) | Nicho: PYMEs de 5 a 50 empleados, precio bajo, enfoque probatorio y onboarding en minutos |
| Responsabilidad si un cliente pierde un juicio | Términos de servicio claros. El producto es una herramienta, no asesoría legal |
| Fallo de conectividad al registrar | Registro offline con sello diferido, marcado como tal en la bitácora |
| Manipulación por parte del patrón | Inmutabilidad, conformidad del trabajador y exportación con hash |

## Decisiones pendientes

1. Stack técnico: se decide después de validar el análisis legal.
2. Modelo de precio (por empleado al mes o por plan).
3. Si conviene una app nativa o basta con una PWA.
4. Hosting y ubicación de los datos.
