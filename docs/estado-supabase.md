# Estado de la configuración en Supabase

Bitácora de lo aplicado en los proyectos en la nube. No contiene secretos.

| | `checador-pruebas` | `checador-produccion` |
|---|---|---|
| Project Ref | `iydppfmwuktjlgtvrdif` | `ajfplcfirscvxhrmqhhr` |
| Región / Postgres | us-east-1 / 17.11 | us-east-1 / 17.11 |
| Plan de la organización | Gratuito (subir a **Pro** antes del primer cliente) | ídem |
| Migraciones (10) | ✅ aplicadas por API | ✅ aplicadas por API |
| `verificar-seguridad.sql` | ✅ 0 hallazgos | ✅ 0 hallazgos |
| Asesor de Supabase | ✅ 16 avisos esperados (sección 1.7 de la guía) | ✅ 16 avisos esperados |
| Verificación externa (`verificar-despliegue.sh`, `SOLO_SUPABASE=1`) | ✅ sin fallas | ✅ sin fallas |
| SSL obligatorio | ✅ | ✅ |
| Auth: código de 6 dígitos, 15 min, confirmar correo, sin anónimos ni teléfono | ✅ | ✅ |
| SMTP propio (Resend, `smtp.resend.com:465`, remitente `Reloj Checador <no-responder@checador.jemba.mx>`) | ✅ llave `checador-smtp-pruebas` | ✅ llave `checador-smtp-produccion` |
| Plantillas en español con el código | ✅ | ✅ |
| Límite de correos de Auth | ✅ 60/hora | ✅ 60/hora |
| Prueba real de envío | ✅ entregado (Resend: `delivered`) | — |
| Site URL y URLs permitidas | ⏳ pendiente (dominio de Vercel) | ⏳ pendiente |
| Llaves heredadas (legacy) desactivadas | ⏳ manual, en el dashboard | ⏳ manual |
| Network restrictions | ⏳ manual, en el dashboard | ⏳ manual |
| Token de administración | `checador-configuracion-2` activo → **revocar al terminar** | |

## Correo (Resend + Cloudflare)

- Dominio de envío **`checador.jemba.mx`** verificado en Resend (región us-east-1), separado de `jemba.mx`.
- Registros creados en Cloudflare (sin proxy), sin modificar ningún registro existente de `jemba.mx`:
  `resend._domainkey.checador` (DKIM) · `send.checador` (MX y SPF) · `rsend.checador` (CNAME) · `_dmarc.checador` (`p=quarantine`).
- `jemba.mx` **no tiene DMARC** (afecta también al correo de Google Workspace); se recomienda agregar uno con `p=none` para empezar. Pendiente de decisión.
- Plan gratuito de Resend: ~100 correos/día.

## Tokens temporales que hay que revocar al terminar

| Token | Dónde | Hace falta todavía para |
|---|---|---|
| `checador-configuracion-2` | Supabase → Account → Access Tokens | Site URL (al publicar en Vercel) |
| `Checador` (DNS · Editar · jemba.mx, caduca en 7 días) | Cloudflare → My Profile → API Tokens | Registro de `checador.jemba.mx` para Vercel |
| `checador-configuracion` (Full access) | Resend → API Keys | **Ya no**: revócala ahora |
