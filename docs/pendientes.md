# Pendientes

Actualizado el 2026-11-25. Lo hecho está en la rama `pruebas`; producción (`main`) no tiene todavía el diseño de
Jemba, WhatsApp, avisos, horarios, Salir con PIN o huella, ubicación al checar ni el manual 1.3. Detalle técnico: `docs/estado-supabase.md`, `docs/plan-app-movil.md` y
`docs/publicacion.md`.

## Bloquea producción

- [ ] **Supabase Pro y reactivar el proyecto de producción** (`ajfplcfirscvxhrmqhhr`). Sin respuesta desde el
      2026-11-16, probablemente pausado por inactividad. Mientras tanto nadie puede entrar ni checar en
      `checador.jemba.mx` y la verificación de cada lunes falla. En el plan gratuito, a los 90 días ya no se reactiva
      desde el panel.
- [ ] **Paso a producción** (lo hace Claude una vez reactivada): migraciones 18 a 31 (incluye horarios, Salir con PIN o huella, ubicación al checar, diseño de correos y suscripciones con prueba de 14 días), código de `pruebas` a `main`,
      manual 1.3 con sus cuatro hojas y verificación de producción (`verificar-produccion.yml`). El usuario pone en
      producción los secretos y variables de WhatsApp (§1.9) y avisos (§1.10); producción no necesita el bypass de
      Vercel.

## Manual (al terminar de pulir la aplicación)

- [ ] **Actualizar el manual y las hojas** cuando el usuario dé por terminado el pulido de la app (decisión del
      2026-11-25: no antes). Falta: ubicación al checar (Centros, aviso en Checar y kiosco, bitácora del panel, Mis
      registros, ver en mapa), nuevo acomodo de la ficha del trabajador (Datos, Kiosco y WhatsApp, Baja; capturas 05, 06,
      31 y 32), cabecera de la ficha con indicadores y acuerdo plegado, app del trabajador (barra inferior, tarjeta del reloj, pendientes), fechas legibles en toda la app, Configuración por tarjetas, texto del acuerdo como documento, Trabajadores en el celular, Objeciones, Exportar, constancia PDF, correos, entrada y alta de la empresa, páginas de error y de carga, ventana para corregir o anular en la bitácora, gráfica de horas de la semana en el Tablero, pantalla de reposo del kiosco (reloj grande tras 45 s sin uso), Accesos en tarjetas con ventana para invitar y pasos del kiosco con QR (captura 09; el capturador ya usa el flujo nuevo), confirmación del kiosco al checar, pantalla "Tu cuenta aún no está vinculada a un empleador" con Volver a revisar (cambia su texto en el manual y la hoja del trabajador), y lo que se pula después. Regenerar con `docs/manual/fuente/capturas.cjs` y `generar.cjs`; para capturas con historial realista (varias semanas, objeciones, ubicación) está la empresa de ejemplo de `scripts/ejemplo/` (solo Supabase local).

## Del usuario (en pruebas)

- [x] **Guía rápida publicada en jemba.mx** (2026-11-26; con precios y calculadora desde el 2026-11-27) con
      `docs/publicar/guia-rapida-checador.html`. Sus botones
      llevan a `checador.jemba.mx`, que no funciona hasta reactivar producción. Si cambia `/guia`, regenerarla con
      `node scripts/guia-html.mjs` (con la app corriendo) y volver a subirla.

- [ ] **WhatsApp con Meta** (`docs/publicacion.md` §1.9): app de Meta con número de prueba, secreto de servicio
      `whatsapp`, variables `WHATSAPP_*` en Vercel (Preview, rama `pruebas`) y webhook con
      `?x-vercel-protection-bypass=<secreto>` al final de la URL. Después Claude hace la primera prueba real y confirma
      la versión de la API de Meta (hoy `v24.0`, supuesta).
- [ ] **Forja**: instalar el bot desde una sesión de Claude Code en la computadora del usuario siguiendo
      `forja/README.md` (Remote Control no ofrece la carpeta a sesiones en la nube). Pasar a Claude la URL del bot para
      verificar el reenvío. No registrar el webhook de Forja en Meta ni guardar `WHATSAPP_VERIFY_TOKEN` en Forja.
- [ ] **Recarga del kiosco con versión nueva en una tableta real** (`docs/publicacion.md` §2.5). El aviso con
      **Actualizar** ya se probó en el teléfono el 2026-11-21; la recarga sola del kiosco solo está probada en e2e.
- [ ] **Huella o rostro en iPhone** (pantalla de inicio, Llavero de iCloud). En pruebas ya están el secreto `acceso` y
      `ACCESO_SECRETO_SERVICIO`, y en Android funciona (probado el 2026-11-25). En producción falta repetir
      `docs/publicacion.md` §1.12 con un secreto distinto.
- [ ] **Plantilla nueva del correo con el código** en el Supabase de pruebas (y después en producción): pegar
      `supabase/templates/codigo.html` en Authentication → Emails → Templates (Magic Link y Confirm signup), o
      autorizar a Claude a correr `scripts/configurar-auth.py <ref>` (sin `--site-url`). `docs/publicacion.md` §1.4.
- [ ] **Llave de Google para el mapa en ventana** (opcional, `docs/publicacion.md` §1.13): proyecto de Google Cloud con
      facturación, Maps Embed API y `GOOGLE_MAPS_EMBED_KEY` en Vercel. Sin ella, el mapa abre en otra pestaña.
- [ ] **Ubicación al checar en teléfonos reales** (Android y iPhone con Checador en la pantalla de inicio): permiso,
      precisión en interiores y que la checada se registre igual al negar el permiso.
- [ ] **Avisos en iPhone**: probar con Checador agregado a la pantalla de inicio (Android ya probado el 2026-11-20).
      El resultado decide si la fase 3 (app en tiendas) es urgente.
- [ ] **Número real de WhatsApp**: cuando exista, ponerlo en `docs/manual/fuente/hojas/whatsapp.html` y en el manual.

## Revisión legal (antes del primer cliente)

- [ ] Plantilla del acuerdo de registro (`apps/web/lib/acuerdo.ts`).
- [ ] Interpretación 11 (volver a entrar con PIN sin cambiar el acuerdo).
- [ ] **Interpretación 12 (ubicación al checar)** antes de activarla para un cliente: texto de la cláusula NOVENA,
      si basta el aviso de privacidad o hace falta un consentimiento separado, y el plazo de 90 días.
- [ ] Interpretaciones 8 y 9 de `packages/jornada/README.md` (checada y conformidad por WhatsApp). Si cambian, ajustar
      el manual (3.17 y capítulo 6) y la hoja de WhatsApp.
- [ ] Redacción del método "aplicación" en el acuerdo antes de publicar una app en tiendas (hoy dice "Aplicación
      web"); cambiarla deja desactualizados todos los acuerdos firmados.
- [ ] Aviso de privacidad: ubicación al checar (si el centro la activa; plazo de 90 días; Google recibe las coordenadas al abrir "ver en mapa"), llave pública de la passkey (huella o rostro), celular y Meta (WhatsApp), identificador del navegador y servicios de notificaciones
      (avisos), y Forja con su proveedor de IA (números no registrados).
- [ ] Contrato y términos de servicio.

## Limpieza de credenciales

- [ ] Revocar los tokens de Cloudflare (`Checador`) y Resend (`checador-configuracion`).
- [ ] Revocar en Supabase el token viejo `checador-configuracion-2` y borrar su entrada "Supabase
      checador-configuracion-2" en los secretos de red del entorno de Claude (el vigente es `checador-migraciones`).
- [ ] Regenerar la licencia de Forja (quedó escrita en una conversación).

## Decisiones abiertas

- [ ] **"Novedades" para el empleador** (pospuesto el 2026-11-21): qué cambió en cada versión, visible en el panel.
      El aviso de versión nueva y Skew Protection ya están (`docs/publicacion.md` §2.5).

- [ ] Cuentas de Apple y Google Play: a nombre de una organización (Jemba) o personal (`docs/plan-app-movil.md`).
- [ ] Aviso de "turno abierto": requiere antes una forma de que la persona pida una corrección.
- [ ] Compartir las pantallas del trabajador entre la PWA y la app nativa, o duplicarlas.

## Antes del primer cliente (además de lo anterior)

- [ ] Desactivar las llaves heredadas (legacy) y configurar las restricciones de red en Supabase (ambos proyectos).
