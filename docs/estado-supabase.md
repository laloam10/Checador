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
| Plantillas en español con el código | ⏳ requiere SMTP propio o Pro | ⏳ ídem |
| SMTP propio | ⏳ pendiente (proveedor y dominio) | ⏳ pendiente |
| Site URL y URLs permitidas | ⏳ pendiente (dominio de Vercel) | ⏳ pendiente |
| Llaves heredadas (legacy) desactivadas | ⏳ manual, en el dashboard | ⏳ manual |
| Network restrictions | ⏳ manual, en el dashboard | ⏳ manual |
| Token de administración | `checador-configuracion-2` activo → **revocar al terminar** | |
