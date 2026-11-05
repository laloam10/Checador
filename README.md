# Checador

Sistema de registro electrónico de jornada laboral (entradas y salidas) para PYMEs en México, orientado al cumplimiento de la Ley Federal del Trabajo (LFT) tras la reforma publicada en el DOF el 1 de mayo de 2026 (art. 132 fr. XXXIV y art. 994 fr. IV Bis; conservación de controles de asistencia según el art. 804).

> **Estado:** fase de análisis. Todavía no hay código. El análisis legal ya está verificado contra el texto oficial vigente de la LFT. Siguen pendientes las disposiciones de la STPS (entran en vigor el 1 de enero de 2027) y la validación de un abogado laboralista.

## Documentos

| Documento | Contenido |
|---|---|
| [docs/analisis-legal.md](docs/analisis-legal.md) | Requisitos legales, fuentes, discrepancias y preguntas abiertas |
| [docs/mvp.md](docs/mvp.md) | Alcance propuesto del producto mínimo, riesgos y decisiones pendientes |
| [docs/stack.md](docs/stack.md) | Stack técnico (ADR-001) |
| [supabase/README.md](supabase/README.md) | Base de datos: modelo, garantías y cómo conectarla |
| [docs/estado-supabase.md](docs/estado-supabase.md) | Estado de la configuración de los proyectos en la nube |
| [docs/publicacion.md](docs/publicacion.md) | **Guía de publicación segura** (Supabase, Vercel, SMTP, dominio, verificación, respaldos, operación) |
| [apps/web/README.md](apps/web/README.md) | PWA del trabajador: configuración, seguridad y prueba de punta a punta |

## Próximos pasos

1. ~~Verificar el texto literal del decreto y sus transitorios.~~ Hecho (2026-11-05).
2. Vigilar en el DOF la publicación de las disposiciones generales de la STPS.
3. Validar el análisis con un abogado laboralista.
4. ~~Definir el stack técnico.~~ Hecho: ver `docs/stack.md`.
5. ~~Motor de cálculo (`packages/jornada`).~~ Hecho.
6. ~~Esquema de base de datos en Supabase (`supabase/`).~~ Hecho. Pendientes en `supabase/README.md`.
7. ~~PWA del trabajador (`apps/web`).~~ Hecho, con prueba de punta a punta.
8. ~~Kiosco con PIN (`/kiosco`).~~ Hecho, con prueba de punta a punta.
9. ~~Panel del empleador (`/panel`): alta de empresa, trabajadores, PINs, centros, accesos, correcciones y objeciones.~~ Hecho, con prueba de punta a punta.
10. ~~Acuerdo de registro electrónico con firma de ambas partes (prueba plena, art. 132 XXXIV).~~ Hecho, con prueba de punta a punta. **Pendiente: revisión de la plantilla por un abogado.**
11. ~~Exportación para inspección o juicio (PDF/CSV con huella SHA-256 y verificación de archivos).~~ Hecho, con prueba de punta a punta.
12. ~~Alta guiada: primeros pasos en el tablero, firma de acuerdos en lote, indicador de acuerdos vigentes.~~ Hecho, con prueba de punta a punta.
13. ~~Endurecimiento y guía de publicación (`docs/publicacion.md`).~~ Hecho: CSP con nonce, privilegios mínimos, verificación automática de producción y respaldos.
14. Pendiente externo: disposiciones de la STPS (formato oficial, si lo hay) y revisión legal de la plantilla del acuerdo.

## Desarrollo

```bash
npm install
npm test
```
