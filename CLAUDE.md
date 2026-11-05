# Checador: instrucciones para Claude Code

Producto SaaS de registro electrónico de jornada para PYMEs en México (LFT art. 132 fr. XXXIV, reforma DOF 01-05-2026).

## Contexto obligatorio

- El análisis legal está en `docs/analisis-legal.md`; el alcance, en `docs/mvp.md`; el stack, en `docs/stack.md`.
- **Toda regla de negocio con efecto legal debe citar su fundamento** (artículo de la LFT o transitorio) en el código o en la documentación. Si una regla es una interpretación y no texto literal, agrégala a la lista de interpretaciones de `packages/jornada/README.md`.
- No prometer "cumplimiento garantizado" ni "certificación" en textos de la interfaz o de marketing.

## Convenciones

- Monorepo con npm workspaces: `packages/*` (librerías) y `apps/*` (aplicaciones).
- TypeScript estricto. El tiempo se maneja en **minutos enteros** y el dinero en **centavos enteros**.
- Fechas en hora local del centro de trabajo: `YYYY-MM-DDTHH:mm`.
- Código, comentarios y mensajes en español.
- La bitácora de eventos es de **solo inserción**: nunca se escribe código que haga `UPDATE` o `DELETE` sobre eventos; las correcciones son eventos nuevos.

## Comandos

```bash
npm install
npm test
npm run typecheck
```

Antes de cada commit, ejecuta `npm test` y `npm run typecheck`.
