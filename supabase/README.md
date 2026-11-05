# Base de datos (Supabase)

## Migraciones

| Archivo | Contenido |
|---|---|
| `migrations/…01_esquema_inicial.sql` | Tablas, bitácora encadenada, acuerdos, firmas y conformidades |
| `migrations/…02_rls.sql` | Funciones auxiliares, `crear_empresa()`, `verificar_cadena()` y políticas RLS |

### Modelo

```
empresas ─┬─ miembros (propietario | admin | supervisor | kiosco)
          ├─ centros_trabajo ── trabajadores ─┬─ eventos (bitácora encadenada)
          ├─ cadena_estado                    ├─ acuerdos ── firmas_acuerdo
                                              └─ conformidades (ancladas a la cadena)
```

### Garantías (probadas en `tests/10_pruebas.sql`)

- **Aislamiento:** una empresa no puede ver ni escribir datos de otra.
- **Hora del servidor:** el cliente no puede fijar `hora_servidor`, `secuencia` ni los hashes.
- **Solo inserción:** `eventos`, `acuerdos`, `firmas_acuerdo` y `conformidades` rechazan `UPDATE`, `DELETE` y `TRUNCATE`, incluso para el superusuario.
- **Cadena de hashes por empresa:** si alguien altera la base saltándose los triggers, `verificar_cadena()` devuelve la primera secuencia inválida. Se probó con 400 inserciones concurrentes.
- **Correcciones:** siempre son eventos nuevos, con motivo y autor; nunca modifican el original.
- **Conservación (art. 804):** los trabajadores no se borran; se registra su `fecha_baja`.
- **Prueba plena (art. 132 XXXIV):** cada firma guarda el hash del texto firmado, y cada conformidad queda anclada al estado de la cadena al momento de responder.

## Conectar con tu proyecto de Supabase

1. Crea un proyecto en https://supabase.com/dashboard (región sugerida: la más cercana disponible).
2. En la carpeta del repo:

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

`init` solo crea `supabase/config.toml`; no toca las migraciones existentes.

## Pruebas

Las pruebas corren en GitHub Actions en cada `push` (`.github/workflows/ci.yml`). Para correrlas en local hace falta un PostgreSQL 15 o superior vacío, sin Supabase:

```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/run-local.sh
```

## Pendientes conocidos

- **PIN del trabajador en kiosco:** hoy una cuenta de kiosco puede registrar eventos de cualquier trabajador activo de su empresa. Falta validar un PIN o un código QR en una función de servidor.
- **Evidencia (IP y agente de usuario):** la columna `evidencia` la envía el cliente. Debe llenarla una ruta de servidor o una Edge Function, no el navegador.
- **Invitaciones:** alta de supervisores y vinculación del trabajador con su cuenta.
- **NOM-151:** constancias de conservación para acuerdos y cierres de periodo (fase 2).
