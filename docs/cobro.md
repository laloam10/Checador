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
2. **Pago en línea y factura (pendiente).** Stripe Billing con precio por tramos
   (`tiers_mode=graduated`), cantidad = personas activas, prorrateo y portal del cliente. Un
   aviso de Stripe (pago cobrado, fallido, cancelado) actualiza `suscripciones` con el secreto
   del servicio `cobro` (como WhatsApp y avisos; nunca la llave `service_role`) y pide el CFDI 4.0
   a un PAC por API, con los datos fiscales que el cliente capture en Configuración.
   Requiere: cuenta de Stripe de la empresa vendedora, PAC elegido, y términos del servicio y
   aviso de privacidad publicados.
3. **Restricciones por falta de pago (pendiente).** Solo cuando ya se pueda pagar:

   | Situación | Qué pasa |
   |---|---|
   | Pago fallido, días 1 a 15 | Todo funciona; aviso en el panel; el proveedor reintenta el cobro |
   | Más de 15 días sin pagar | Panel en solo lectura: sin altas ni correcciones |
   | Más de 30 días sin pagar | Se dejan de registrar checadas (kiosco, app y WhatsApp lo dicen) |
   | Siempre, incluso cancelada | La empresa puede exportar y cada persona consulta sus registros |

   Los registros son prueba para ambas partes; nunca se retienen para presionar el pago. Esta
   política debe ir en los términos del servicio y revisarla un abogado.

## Pendientes de decisión

- PAC para los CFDI (¿el que ya se usa en la empresa?).
- Contacto de ventas para más de 40 personas (hoy la app enlaza a jemba.mx).
- Comisiones de Stripe y del PAC: confirmarlas antes de fijar los precios definitivos.
