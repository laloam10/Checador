# Estado de la configuración en Supabase

Bitácora de lo aplicado en los proyectos en la nube. No contiene secretos.

| | `checador-pruebas` | `checador-produccion` |
|---|---|---|
| Project Ref | `iydppfmwuktjlgtvrdif` | `ajfplcfirscvxhrmqhhr` |
| Región / Postgres | us-east-1 / 17.11 | us-east-1 / 17.11 |
| Plan de la organización | Gratuito (subir a **Pro** antes del primer cliente) | ídem |
| Migraciones (10) | ✅ aplicadas por API | ✅ aplicadas por API |
| Migración 11: recordatorios de conformidad (`20261112000001`) | ✅ aplicada por API (2026-11-09); tareas de pg_cron creadas | ✅ aplicada por API (2026-11-10); tareas de pg_cron creadas |
| Migración 12: conformidad en el kiosco (`20261113000001`, requiere la 11) | ✅ aplicada por API (2026-11-09) | ✅ aplicada por API (2026-11-10) |
| Migración 13: protección del vínculo trabajador ↔ cuenta (`20261114000001`) | ✅ aplicada por API (2026-11-09); `verificar-seguridad.sql` sin hallazgos | ✅ aplicada por API (2026-11-10) |
| Asesor de Supabase tras las migraciones 11 a 15 | ✅ 20 avisos esperados (guía, 1.7) | ✅ 19 (no muestra el de contraseñas filtradas) |
| Migración 14: historial de bajas y `revertir_baja()` (`20261115000001`) | ✅ aplicada por API (2026-11-09); asesor: 20 avisos esperados | ✅ aplicada por API (2026-11-10) |
| Migración 15: indicador de conformidad en la base (`20261116000001`) | ✅ aplicada por API (2026-11-10); sin avisos nuevos | ✅ aplicada por API (2026-11-10); `verificar-seguridad.sql` sin hallazgos |
| Secretos de Vault para recordatorios (guía, sección 1.8) | ✅ llave `checador-recordatorios-pruebas`; envío de prueba aceptado por Resend (2026-11-10) | ✅ llave `checador-recordatorios-produccion` |
| Migración 16: revisar recordatorios cada hora (`20261117000001`) | ✅ aplicada por API (2026-11-10) | ✅ aplicada por API (2026-11-10) |
| Migración 17: días de descanso adicionales (`20261118000001`) | ✅ aplicada por API (2026-11-10) | ⏳ pendiente |
| `verificar-seguridad.sql` | ✅ 0 hallazgos | ✅ 0 hallazgos |
| Asesor de Supabase | ✅ 16 avisos esperados (sección 1.7 de la guía) | ✅ 16 avisos esperados |
| Verificación externa (`verificar-despliegue.sh`, `SOLO_SUPABASE=1`) | ✅ sin fallas | ✅ sin fallas |
| SSL obligatorio | ✅ | ✅ |
| Auth: código de 6 dígitos, 15 min, confirmar correo, sin anónimos ni teléfono | ✅ | ✅ |
| SMTP propio (Resend, `smtp.resend.com:465`, remitente `Reloj Checador <no-responder@checador.jemba.mx>`) | ✅ llave `checador-smtp-pruebas` | ✅ llave `checador-smtp-produccion` |
| Plantillas en español con el código | ✅ | ✅ |
| Límite de correos de Auth | ✅ 60/hora | ✅ 60/hora |
| Prueba real de envío | ✅ entregado (Resend: `delivered`) | — |
| Site URL y URLs permitidas | ✅ `https://checador-pruebas.vercel.app` | ✅ `https://checador.jemba.mx` |
| Llaves heredadas (legacy) desactivadas | ⏳ manual, en el dashboard | ⏳ manual |
| Network restrictions | ⏳ manual, en el dashboard | ⏳ manual |
| Token de administración | `checador-configuracion-2` activo → **revocar al terminar** | |

## Aplicación (Vercel, equipo Checador · Pro)

- Proyecto `checador` (`prj_lYlK4rLpOFR3xU2i0bRWd7YIUaln`), Root Directory `apps/web`, Node.js 22.x, región `iad1`.
- **Producción:** https://checador.jemba.mx (rama `main`) → `checador-produccion`.
- **Pruebas:** https://checador-pruebas.vercel.app (rama `pruebas`) → `checador-pruebas`. Privada: pide iniciar sesión en Vercel.
- Demás vistas previas y desarrollo → `checador-pruebas`.
- Protección: `all_except_custom_domains` (las vistas previas y `*.vercel.app` piden iniciar sesión en Vercel).
- DNS: `CNAME checador → c072d25b9226339a.vercel-dns-016.com` en Cloudflare, **sin proxy** (Vercel emite el certificado).
- `verificar-despliegue.sh` contra producción: **sin fallas** (la redirección HTTP→HTTPS se comprueba desde GitHub Actions).
- Verificación semanal: `.github/workflows/verificar-produccion.yml` (lunes).

## Correo (Resend + Cloudflare)

- Dominio de envío **`checador.jemba.mx`** verificado en Resend (región us-east-1), separado de `jemba.mx`.
- Registros creados en Cloudflare (sin proxy), sin modificar ningún registro existente de `jemba.mx`:
  `resend._domainkey.checador` (DKIM) · `send.checador` (MX y SPF) · `rsend.checador` (CNAME) · `_dmarc.checador` (`p=quarantine`).
- `_dmarc.jemba.mx` creado con `p=none` (monitoreo; no cambia la entrega). Endurecer a `p=quarantine` cuando todo el correo legítimo pase la autenticación.
- Plan gratuito de Resend: ~100 correos/día, compartidos entre los códigos de entrada y los recordatorios de los lunes (guía, sección 1.8).

## Tokens temporales que hay que revocar al terminar

| Token | Dónde | Hace falta todavía para |
|---|---|---|
| `checador-configuracion-2` | Supabase → Account → Access Tokens | Se usó el 2026-11-09 para las migraciones 11–13 de pruebas. Revócalo al terminar; para producción, crea uno nuevo |
| `Checador` (DNS · Editar · jemba.mx) | Cloudflare → My Profile → API Tokens | **Ya no**: revócalo |
| `checador-configuracion` (Full access) | Resend → API Keys | **Ya no**: revócala |
| `checador-configuracion` | Vercel → Account Settings → Tokens | **Ya no**: revócalo |
