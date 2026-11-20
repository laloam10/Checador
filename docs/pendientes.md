# Pendientes

Actualizado el 2026-11-20. Lo hecho está en la rama `pruebas`; producción (`main`) no tiene todavía el diseño de
Jemba, WhatsApp, avisos ni el manual 1.2. Detalle técnico: `docs/estado-supabase.md`, `docs/plan-app-movil.md` y
`docs/publicacion.md`.

## Bloquea producción

- [ ] **Supabase Pro y reactivar el proyecto de producción** (`ajfplcfirscvxhrmqhhr`). Sin respuesta desde el
      2026-11-16, probablemente pausado por inactividad. Mientras tanto nadie puede entrar ni checar en
      `checador.jemba.mx` y la verificación de cada lunes falla. En el plan gratuito, a los 90 días ya no se reactiva
      desde el panel.
- [ ] **Paso a producción** (lo hace Claude una vez reactivada): migraciones 18 a 24, código de `pruebas` a `main`,
      manual 1.2 con sus cuatro hojas y verificación de producción (`verificar-produccion.yml`). El usuario pone en
      producción los secretos y variables de WhatsApp (§1.9) y avisos (§1.10); producción no necesita el bypass de
      Vercel.

## Del usuario (en pruebas)

- [ ] **WhatsApp con Meta** (`docs/publicacion.md` §1.9): app de Meta con número de prueba, secreto de servicio
      `whatsapp`, variables `WHATSAPP_*` en Vercel (Preview, rama `pruebas`) y webhook con
      `?x-vercel-protection-bypass=<secreto>` al final de la URL. Después Claude hace la primera prueba real y confirma
      la versión de la API de Meta (hoy `v24.0`, supuesta).
- [ ] **Forja**: instalar el bot desde una sesión de Claude Code en la computadora del usuario siguiendo
      `forja/README.md` (Remote Control no ofrece la carpeta a sesiones en la nube). Pasar a Claude la URL del bot para
      verificar el reenvío. No registrar el webhook de Forja en Meta ni guardar `WHATSAPP_VERIFY_TOKEN` en Forja.
- [ ] **Avisos en iPhone**: probar con Checador agregado a la pantalla de inicio (Android ya probado el 2026-11-20).
      El resultado decide si la fase 3 (app en tiendas) es urgente.
- [ ] **Número real de WhatsApp**: cuando exista, ponerlo en `docs/manual/fuente/hojas/whatsapp.html` y en el manual.

## Revisión legal (antes del primer cliente)

- [ ] Plantilla del acuerdo de registro (`apps/web/lib/acuerdo.ts`).
- [ ] Interpretaciones 8 y 9 de `packages/jornada/README.md` (checada y conformidad por WhatsApp). Si cambian, ajustar
      el manual (3.17 y capítulo 6) y la hoja de WhatsApp.
- [ ] Redacción del método "aplicación" en el acuerdo antes de publicar una app en tiendas (hoy dice "Aplicación
      web"); cambiarla deja desactualizados todos los acuerdos firmados.
- [ ] Aviso de privacidad: celular y Meta (WhatsApp), identificador del navegador y servicios de notificaciones
      (avisos), y Forja con su proveedor de IA (números no registrados).
- [ ] Contrato y términos de servicio.

## Limpieza de credenciales

- [ ] Revocar los tokens de Cloudflare (`Checador`) y Resend (`checador-configuracion`).
- [ ] Revocar en Supabase el token viejo `checador-configuracion-2` y borrar su entrada "Supabase
      checador-configuracion-2" en los secretos de red del entorno de Claude (el vigente es `checador-migraciones`).
- [ ] Regenerar la licencia de Forja (quedó escrita en una conversación).

## Decisiones abiertas

- [ ] Cuentas de Apple y Google Play: a nombre de una organización (Jemba) o personal (`docs/plan-app-movil.md`).
- [ ] Aviso de "turno abierto": requiere antes una forma de que la persona pida una corrección.
- [ ] Compartir las pantallas del trabajador entre la PWA y la app nativa, o duplicarlas.

## Antes del primer cliente (además de lo anterior)

- [ ] Desactivar las llaves heredadas (legacy) y configurar las restricciones de red en Supabase (ambos proyectos).
