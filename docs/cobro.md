# Cobro y licenciamiento

Decisión del 2026-11-26: suscripción mensual con **precio escalonado por persona trabajadora
activa**, sin saltos entre planes. El cálculo vive en `apps/web/lib/precios.ts` (con pruebas).

## Precio

| Personas activas | Precio por persona en ese tramo |
|---|---|
| Hasta 2 | $199 al mes, fijo |
| De la 3.ª a la 10.ª | $50 |
| De la 11.ª a la 40.ª | $30 |
| Más de 40 | Cotización (ventas) |

Cada tramo solo se aplica a las personas que caen en él, como los impuestos: agregar a una
persona nunca cuesta más de $50. Ejemplos: 5 personas $349, 10 personas $599, 20 personas $899,
40 personas $1,499. Precios **más IVA** (se muestra también el total con IVA).

- **Anual:** 10 meses (2 de regalo).
- **Prueba:** 14 días con todas las funciones, sin tarjeta. Empieza al crear la empresa (antes 30; cambio del 2026-11-26, migración `20261202000001`).
- **Un solo plan:** todas las funciones para todos; el precio solo depende de cuántas personas.
- **Quién cuenta:** personas trabajadoras dadas de alta y sin baja. Dueño, administradores,
  supervisores y kioscos son ilimitados y sin costo.
- **Altas y bajas a mitad del periodo:** el siguiente cobro se ajusta por los días (prorrateo).

Por qué así y no paquetes cerrados: con paquetes (p. ej., $599 de 6 a 10 y $1,499 de 11 a 40),
pasar de 10 a 11 personas costaba $900 más al mes. Eso empuja al cliente a no registrar a
algunas personas, que es justo el incumplimiento que Checador ayuda a evitar.

## Fases

1. **Estado y prueba (hecha).** Tabla `suscripciones` (migración `20261201000001`), prueba de 14
   días automática y sección **Configuración → Suscripción** con el estado y el precio de ese mes
   con su desglose. No restringe nada.
2. **Pago en línea (hecho en modo de prueba, 2026-11-27; factura pendiente).** Stripe Billing con precio por tramos
   (`tiers_mode=graduated`), cantidad = personas activas, prorrateo y portal del cliente. Un
   aviso de Stripe (pago cobrado, fallido, cancelado) actualiza `suscripciones` con el secreto
   del servicio `cobro` (como WhatsApp y avisos; nunca la llave `service_role`) y pide el CFDI 4.0
   a un PAC por API, con los datos fiscales que el cliente capture en Configuración.
   Hecho: producto y precios en Stripe (`scripts/stripe-configurar.mjs`), contratar con tarjeta (con la prueba, el
   primer cobro llega al terminar), portal del cliente, ajuste de personas con prorrateo en cada alta o baja y la
   ruta `/api/stripe/webhook` (migración `20261203000001`; prueba `apps/web/e2e/cobro.e2e.mjs`). Activarlo en
   pruebas: `docs/publicacion.md` §1.14. Falta: el CFDI (PAC por elegir) y, para producción, activar la cuenta de
   Stripe y publicar términos del servicio y aviso de privacidad.
3. **Restricciones por falta de pago (hecha, 2026-11-28; migración `20261204000001`).**

   | Situación | Qué pasa |
   |---|---|
   | Pago fallido, días 1 a 15 | Todo funciona; aviso en el panel; el proveedor reintenta el cobro |
   | Más de 15 días sin pagar | Panel en solo lectura: sin altas ni correcciones |
   | Más de 30 días sin pagar | Se dejan de registrar checadas (kiosco, app y WhatsApp lo dicen) |
   | Siempre, incluso cancelada | La empresa puede exportar y cada persona consulta sus registros |

   Los registros son prueba para ambas partes; nunca se retienen para presionar el pago. Esta
   política debe ir en los términos del servicio y revisarla un abogado.

   Cómo está hecha:
   - Las aplica la base de datos con disparadores en `eventos`, `trabajadores` y `acuerdos`, así que valen por
     cualquier vía (panel, app, kiosco y WhatsApp). `situacion_cobro()` dice el nivel y las fechas de cada etapa.
   - **Solo lectura:** sin altas, sin deshacer bajas, sin capturas ni correcciones del panel y sin generar acuerdos.
     Siempre se permite: dar de baja, configurar, exportar, consultar, dar conformidad y firmar un acuerdo ya generado.
   - **Suspendida:** además, no se registran checadas; la app, el kiosco y WhatsApp dicen el motivo. Una checada hecha
     **sin conexión antes** de la suspensión se acepta aunque llegue después (no se pierde un registro real).
   - **Cancelada:** suspendida desde que Stripe la cancela (al terminar el periodo pagado).
   - **Prueba terminada sin tarjeta** (decisión del 2026-11-28, migraciones `20261205000001` y `20261206000001`):
     aviso el primer día, solo lectura desde el día siguiente y suspendida a los 7 días del fin de la prueba. Con
     tarjeta registrada no hay restricción; Stripe cobra al terminar.
   - El panel muestra un aviso en todas sus páginas con lo que pasa y la fecha de la siguiente etapa.
   - Pruebas: `supabase/tests/108_falta_de_pago.sql` y el paso 6 de `apps/web/e2e/cobro.e2e.mjs`.

## Pendientes de decisión

- **Suspender las checadas a los 30 días:** pregunta abierta para el abogado (nota 3 de los términos).

- PAC para los CFDI (¿el que ya se usa en la empresa?).
- Contacto de ventas para más de 40 personas (hoy la app enlaza a jemba.mx).
- Comisiones de Stripe y del PAC: confirmarlas antes de fijar los precios definitivos.
