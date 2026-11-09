# Base de datos (Supabase)

## Migraciones

| Archivo | Contenido |
|---|---|
| `migrations/…01_esquema_inicial.sql` | Tablas, bitácora encadenada, acuerdos, firmas y conformidades |
| `migrations/…02_rls.sql` | Funciones auxiliares, `crear_empresa()`, `vincular_mi_cuenta()`, `verificar_cadena()` y políticas RLS |
| `migrations/…06…01_kiosco_pin.sql` | PIN (bcrypt) con bloqueo por intentos, `kiosco_identificar()`, `kiosco_checar()`, pausa según el centro |
| `migrations/…07…01_panel_invitaciones.sql` | Invitaciones por correo (admin, supervisor, kiosco), `miembros_de_empresa()`, `trabajadores_con_pin()` |
| `migrations/…10…01_endurecimiento.sql` | Privilegios mínimos: el rol anónimo sin acceso; nadie con `TRUNCATE` |
| `migrations/…11…01_privilegios_explicitos.sql` | Permisos explícitos por tabla: no depende de "Automatically expose new tables"; sin UPDATE/DELETE sobre la evidencia |
| `migrations/…11…02_funciones_internas.sql` | Solo las funciones diseñadas como API son ejecutables; ninguna función nueva lo es por omisión |
| `migrations/…10…02_vinculo_solo_codigo.sql` | Vincular cuentas solo si la sesión se inició con código (claim `amr`) |
| `migrations/…09…01_exportaciones.sql` | Registro inmutable de exportaciones con huellas SHA-256 y estado de la cadena |
| `migrations/…08…01_acuerdos_firma.sql` | Modalidades de firma (electrónica, PIN en kiosco, autógrafa), orden de firma, `acuerdo_vigente()`, `acuerdo_pendiente()`, `kiosco_firmar_acuerdo()` |
| `migrations/…15…01_reversion_baja.sql` | Historial de bajas (solo inserción) y `revertir_baja()` con motivo; la fecha de baja ya no se edita directamente |
| `migrations/…14…01_vinculo_trabajador.sql` | Solo `vincular_mi_cuenta()` liga una ficha a una cuenta; cambiar el correo desvincula la cuenta anterior |
| `migrations/…13…01_kiosco_conformidad.sql` | Conformidad semanal en el kiosco con PIN: `_semanas_por_confirmar()` (definición única de semana pendiente), `kiosco_semana()`, `kiosco_conformidad()`; `kiosco_identificar()` devuelve las semanas pendientes |
| `migrations/…12…01_recordatorios_conformidad.sql` | Recordatorios semanales por correo: `conformidades_por_recordar()`, envío con pg_net y llave en Vault, tareas de pg_cron, registro `recordatorios_conformidad`. Configuración: `docs/publicacion.md`, sección 1.8 |

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
- **Kiosco:** solo registra con número de empleado y PIN, verificados en la base. Hay bloqueo por intentos y los PINs no son legibles por la API.
- **Pausa (art. 64):** si se puede salir o no lo impone el centro de trabajo, no quien checa.
- **Prueba plena (art. 132 XXXIV):** cada firma guarda el hash del texto firmado, y cada conformidad queda anclada al estado de la cadena al momento de responder.
- **Bajas (`tests/90_bajas.sql`):** cada baja y reversión queda en el historial; deshacer exige motivo y rol de propietario o administrador; la fecha no se edita por la API.
- **Vínculo ficha ↔ cuenta (`tests/80_vinculo.sql`):** el empleador no puede ligar la ficha de un trabajador a ninguna cuenta (ni a la suya); cambiar el correo desvincula la anterior.
- **Conformidad en el kiosco (`tests/70_kiosco_conformidad.sql`):** solo con número y PIN, solo semanas pendientes, una respuesta por semana, el resumen debe ser de esa semana y de checadas de esa persona; queda como firmada con PIN en el kiosco.
- **Recordatorios (`tests/60_recordatorios.sql`):** solo semanas terminadas con checadas y sin respuesta, o objetadas y corregidas después; máximo un correo cada 6 días; nombres escapados en el HTML; ninguna función de envío es ejecutable por la API.

## Supabase local

`config.toml` está listo para `npx supabase start`. Las plantillas de correo en español con el código de acceso (`{{ .Token }}`) están en `templates/codigo.html`.

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,storage-api,realtime,supavisor,postgres-meta
```

## Conectar con tu proyecto de Supabase

> Para producción sigue la guía completa: [docs/publicacion.md](../docs/publicacion.md). Incluye la configuración de Auth, el SMTP obligatorio y la verificación de seguridad.

1. Crea un proyecto en https://supabase.com/dashboard (región sugerida: la más cercana disponible).
2. En la carpeta del repo:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

`config.toml` ya existe: omite `init` si no lo pide la CLI. Después, en el dashboard, en **Authentication → Email Templates**, copia `templates/codigo.html` en las plantillas **Magic Link** y **Confirm signup**.

## Verificación de seguridad

`verificar-seguridad.sql` debe devolver **cero filas**. Corre en cada ejecución de `tests/run-local.sh` (y en el CI) y en producción desde el SQL Editor.

## Pruebas

Las pruebas corren en GitHub Actions en cada `push` (`.github/workflows/ci.yml`). Para correrlas en local hace falta un PostgreSQL 15 o superior vacío, sin Supabase:

```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/run-local.sh                    # exposición automática activada
EXPONER_TABLAS=0 PGHOST=localhost PGUSER=postgres ./supabase/tests/run-local.sh   # desactivada
```

## Pendientes conocidos

- **Evidencia (IP y agente de usuario):** la PWA ya la llena desde el servidor (`/api/eventos`), pero la base todavía acepta inserciones directas con evidencia enviada por el cliente. Una opción es mover las inserciones a una función `SECURITY DEFINER` que solo pueda llamar el servidor.
- **NOM-151:** constancias de conservación para acuerdos y cierres de periodo (fase 2).
