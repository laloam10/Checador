# Fuentes del manual de usuario

De aquí salen los tres PDF de `docs/manual/`:

| PDF | Fuente |
|---|---|
| `manual-de-usuario.pdf` | `manual.html` |
| `hoja-trabajador.pdf` | `hojas/trabajador.html` |
| `hoja-kiosco.pdf` | `hojas/kiosco.html` |

Las tres usan las capturas de `img/` y el ícono de la app (`apps/web/public/icon-512.png`).

## Cambiar solo el texto

Edita el HTML y regenera los PDF desde la raíz del repositorio:

```bash
node docs/manual/fuente/generar.cjs
```

El script avisa si alguna imagen no carga o si una hoja dejó de caber en una página.

## Volver a tomar las capturas

Hazlo cuando cambien pantallas o textos de la app. `capturas.cjs` recorre la app **local** como dueña, trabajadora y kiosco, y crea la empresa de ejemplo "Tortillería Doña Lupita" con tres trabajadores, horarios de una semana, una corrección y una objeción. **Nunca lo apuntes a pruebas ni a producción**: escribe en la bitácora, que no se puede borrar.

Requisitos (los mismos que las pruebas de punta a punta, ver `apps/web/README.md`):

1. Supabase local con las migraciones (`npx supabase start`), incluido Mailpit en el puerto 54324 para leer los códigos.
2. La app en `http://127.0.0.1:3000` con el `.env.local` de Supabase local:

   ```bash
   npm run build -w @checador/web && npm run start -w @checador/web
   ```

3. `psql` y Playwright con Chromium.

Después:

```bash
LUNES_PASADO=2026-10-26 node docs/manual/fuente/capturas.cjs
node docs/manual/fuente/generar.cjs
```

- `LUNES_PASADO` es el lunes de la semana de ejemplo. Tiene que ser una semana **ya terminada** (si no, no aparece el botón de conformidad). El jueves de esa semana José trabaja 11 horas con 3 de extra; el manual lo describe así.
- Cada corrida crea una empresa nueva con correos distintos, así que se puede repetir sin limpiar la base.
- Tamaños: escritorio 1180×860, celular 390×844 y tableta 820×1100, todos a escala 2.
- Si cambias el texto de un botón o una etiqueta, el script falla en el paso que lo busca: actualízalo ahí y en el HTML del manual.
