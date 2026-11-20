# Plan: notificaciones y app en tiendas (camino B)

Acordado el 2026-11-19. Objetivo: que la persona trabajadora reciba **notificaciones**. La app en las tiendas de
Android e iOS es el medio para hacerlas confiables, no un fin en sí.

## Decisiones tomadas

- **Camino B**: solo lo que usa la persona trabajadora va a las tiendas (entrar, checar, mis registros, conformidad,
  acuerdo, PIN y notificaciones). El panel del empleador sigue siendo web; el kiosco también, por ahora.
- **Primero notificaciones en la PWA actual** (fase 1). Toda la lógica (qué avisar, a quién, cuándo, con qué permiso)
  se reutiliza en la app nativa; solo cambia el canal de entrega.
- **Avisos de la fase 1**: semana por revisar, acuerdo por firmar y corrección hecha por la empresa.

## Avance

- **Fase 1 terminada en código** (2026-11-19, rama `pruebas`): migración `20261123000001_avisos_push.sql`, página
  **Avisos** de la persona trabajadora, envío en `/api/avisos/enviar` y configuración en `docs/publicacion.md` §1.10.
- **Fase 1 funcionando en pruebas** (2026-11-20): migraciones 22 y 23 aplicadas, llaves VAPID y secretos configurados,
  bypass de la protección de Vercel en Vault. Primer aviso real ("semana por revisar") entregado y mostrado en un
  Android con Chrome. Falta probar en iPhone (pantalla de inicio) y llevarlo a producción con las migraciones 18 a 23.

## Decisiones pendientes

- Aviso de **turno abierto** muchas horas: solo si antes existe una forma de que la persona pida una corrección. No
  debe invitar a "registrar la salida ahora", porque asentaría una hora falsa y tiempo extra inexistente.
- Cuentas de tiendas: a nombre de una organización (Jemba) o personal.
- Si las pantallas del trabajador se comparten entre la PWA y la app nativa (recomendado) o se duplican.

## Reglas de los avisos

- El texto no muestra horas ni datos: se lee en la pantalla bloqueada.
- Nada de noche ni en los días de descanso de la persona, salvo urgencia (no hay avisos urgentes hoy).
- La persona puede apagar cada tipo de aviso. El empleador no puede enviar mensajes libres.
- Un aviso no tiene efecto legal: no sustituye la conformidad ni la firma, solo invita a hacerlas.

## Fases

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Cuentas: Apple Developer (99 USD/año; D-U-N-S si es organización), Google Play (25 USD; de organización para evitar 14 días de prueba cerrada con 12 personas), Firebase, Mac o servicio de compilación. Revisión legal: cláusula del método "aplicación" en el acuerdo, aviso de privacidad (token del dispositivo), baja de cuenta compatible con el art. 804 LFT | Usuario |
| 1 | **Notificaciones web (Web Push) en la PWA**: tablas de suscripciones, preferencias y avisos; envío programado; tres avisos; pantalla de preferencias | — |
| 2 | Servidor listo para una app externa: sesión por token en las rutas del trabajador, CORS solo para la app, versión mínima soportada, origen `app` en la bitácora | Fase 1 |
| 3 | App con Vite + Capacitor (`apps/movil`): sesión en almacenamiento seguro, checadas por la API (evidencia del servidor), cola sin conexión nativa, notificaciones nativas con el mismo envío; opcional: verificación del dispositivo (App Attest y Play Integrity) | Fases 0 y 2 |
| 4 | Publicación: TestFlight y prueba interna de Play, formularios de privacidad, baja de cuenta dentro de la app, empresa de demostración para los revisores | Fase 3 y producción activa |
| 5 | Operación: política de versiones aceptadas, monitoreo de entregas, calendario de publicación | Fase 4 |

## Riesgos

- **Acuerdo de registro**: si la cláusula del método cambia de texto, todos los acuerdos firmados quedan
  desactualizados. Redactarla de forma general antes de la fase 3.
- **Producción pausada** (plan gratuito de Supabase): las fases 3 y 4 necesitan producción activa.
- **Empresa de demostración en producción**: choca con "no crear datos de prueba en producción" (la bitácora no se
  borra). Hay que aislarla y aceptarlo de forma explícita.
- **Las correcciones dejan de ser inmediatas** en la app de tiendas (revisión de cada versión).
- **iPhone con PWA**: Web Push solo funciona si la persona agregó Checador a la pantalla de inicio (iOS 16.4 o
  posterior). Es la razón principal para la fase 3.
