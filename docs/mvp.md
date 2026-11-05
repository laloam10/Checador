# MVP: alcance propuesto

> Propuesta inicial. Depende de cerrar las preguntas abiertas de [analisis-legal.md](analisis-legal.md).

## Tesis del producto

Cumplir la ley solo con un registro electrónico es barato: una hoja de cálculo o una app gratuita pueden alcanzar. Lo que una PYME necesita, y por lo que puede pagar, es **un registro que la defienda en una inspección o un juicio laboral**, con el menor esfuerzo de operación posible.

Propuesta de valor: *"Registro de jornada que sirve como prueba, listo para inspección, sin hardware."*

## Dentro del MVP

| Función | Requisito que cubre |
|---|---|
| Alta de empresa, centros de trabajo y trabajadores | Base |
| Registro de entrada, salida y pausas desde el celular o un kiosco web, con hora del servidor | R1, R2, R6, R8 |
| Bitácora de auditoría inmutable: las correcciones exigen motivo y guardan el valor anterior | R5 |
| Portal del trabajador para consultar sus registros y dar conformidad periódica | R7 |
| Cálculo de jornada y horas extra (dobles o triples) según el año de transición | R9 |
| Exportación PDF/CSV por trabajador y periodo, con hash de integridad | R3 |
| Política de retención configurable y respaldos | R4 |
| Aviso de privacidad y recolección mínima de datos (sin biometría en el MVP) | R10 |

## Fuera del MVP (y por qué)

- **Biometría (rostro o huella):** la ley no la exige y aumenta el riesgo bajo la LFPDPPP. Se puede evaluar después como opción con consentimiento expreso.
- **Geocerca obligatoria:** la ley no la exige y es invasiva. Quedaría como opción por centro de trabajo.
- **Nómina y CFDI:** es otro producto y tiene mucha competencia. Se cubre con una integración por exportación.
- **Hardware propio:** sube el costo y la logística.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las reglas de la STPS cambian requisitos técnicos | Diseño modular. No prometer "certificado" ni "100% cumplimiento" |
| Mercado con competidores ya establecidos (Factorial, Checkingo, Linkit, entre otros) | Nicho: PYMEs de 5 a 50 empleados, precio bajo, enfoque probatorio y onboarding en minutos |
| Responsabilidad si un cliente pierde un juicio | Términos de servicio claros. El producto es una herramienta, no asesoría legal |
| Fallo de conectividad al registrar | Registro offline con sello diferido, marcado como tal en la bitácora |
| Manipulación por parte del patrón | Inmutabilidad, conformidad del trabajador y exportación con hash |

## Decisiones pendientes

1. Stack técnico: se decide después de validar el análisis legal.
2. Modelo de precio (por empleado al mes o por plan).
3. Si conviene una app nativa o basta con una PWA.
4. Hosting y ubicación de los datos.
