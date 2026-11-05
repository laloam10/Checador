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

## Próximos pasos

1. ~~Verificar el texto literal del decreto y sus transitorios.~~ Hecho (2026-11-05).
2. Vigilar en el DOF la publicación de las disposiciones generales de la STPS.
3. Validar el análisis con un abogado laboralista.
4. ~~Definir el stack técnico.~~ Hecho: ver `docs/stack.md`.
5. ~~Motor de cálculo (`packages/jornada`).~~ Hecho.
6. ~~Esquema de base de datos en Supabase (`supabase/`).~~ Hecho. Pendientes en `supabase/README.md`.
7. Aplicación web (Next.js): panel del empleador, PWA del trabajador y kiosco.

## Desarrollo

```bash
npm install
npm test
```
