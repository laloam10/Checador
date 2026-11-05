# @checador/web: PWA del trabajador

Aplicación Next.js 16 (App Router) instalable en el celular. El trabajador:

1. **Entra con un código de 6 dígitos** que recibe por correo (sin contraseña). Se usa código y no enlace mágico porque, en una PWA instalada, el enlace se abre en el navegador y no en la app.
2. **Registra entrada, pausas y salida.** La hora la fija el servidor.
3. **Sigue checando sin conexión.** La checada se guarda en el teléfono (IndexedDB) con la hora corregida según el desfase medido contra el servidor. Al volver la red se envía y queda marcada como **diferida**, con ambas horas.
4. **Consulta sus registros por semana:** turnos, pausas, horas extra, incidencias y alertas con su fundamento legal.
5. **Da su conformidad u objeta** cada semana terminada. El resumen se recalcula en el servidor y la respuesta queda anclada a la cadena de la bitácora, con un comprobante (n.º de registro y hash).

## Kiosco (`/kiosco`)

Para quien no tiene celular o correo: una tableta o un teléfono fijo en el centro de trabajo.

1. **Configuración única:** en el dispositivo se entra a `/kiosco` con una cuenta de correo de la empresa (p. ej. `kiosco.centro@empresa.mx`). El administrador le asigna el rol `kiosco` en `miembros`, opcionalmente limitado a un centro de trabajo.
2. **Uso:** el trabajador teclea su **número de empleado** y su **PIN** (4 a 6 dígitos), ve solo su nombre y su estado, y elige la acción válida (entrada, pausa o salida). La pantalla vuelve sola al inicio a los 4 segundos, o a los 20 si nadie la toca.
3. **El PIN** lo asigna el empleador (`asignar_pin`) o el propio trabajador desde la PWA (pantalla **PIN**).
4. **Sin conexión:** la checada se guarda en el dispositivo y el PIN se verifica al reconectar. Si era incorrecto, la checada se rechaza y aparece en el pie de pantalla para que el supervisor la capture desde el panel.

Seguridad:
- El PIN se verifica solo en la base de datos (bcrypt), y el kiosco nunca recibe hashes.
- 5 intentos fallidos bloquean el PIN 15 minutos. 20 fallos en 10 minutos bloquean el kiosco.
- Un número inexistente y un PIN incorrecto dan el mismo mensaje y tardan lo mismo, para no revelar qué números existen.
- La cuenta de kiosco no puede insertar eventos directamente, solo con `kiosco_checar()`.
- El kiosco no muestra historial: en un dispositivo compartido solo aparece el nombre y la hora registrada.
- Se pide a la pantalla que no se apague (Wake Lock).

## Configuración

```bash
cp apps/web/.env.example apps/web/.env.local
# Llena NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev -w @checador/web
```

### Plantillas de correo (obligatorio)

En tu proyecto de Supabase: **Authentication → Email Templates**. Las plantillas **Magic Link** y **Confirm signup** deben incluir `{{ .Token }}`, que es el código. La plantilla en español está en `supabase/templates/codigo.html`. En local se configura sola desde `supabase/config.toml`.

### Alta de trabajadores

Mientras no exista el panel del empleador, el trabajador se da de alta en la base con su `email`. Al entrar por primera vez, `vincular_mi_cuenta()` lo vincula, solo si confirmó el correo con el código.

## Seguridad

- `proxy.ts` refresca la sesión y redirige a `/entrar` si no hay sesión.
- Las rutas `/api/eventos` y `/api/conformidades` usan la sesión del usuario: aplican todas las políticas RLS.
- La evidencia (IP y agente de usuario) la registra el servidor, no el navegador.
- `id_cliente` evita duplicados cuando se reintenta un envío.
- Al salir se borra la caché del service worker, que guarda páginas con datos personales.

## Prueba de punta a punta

```bash
npx supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v lunes=2026-10-26 -f apps/web/e2e/semilla.sql
npm run build -w @checador/web && npm run start -w @checador/web   # con .env.local de Supabase local
LUNES_PASADO=2026-10-26 node apps/web/e2e/pwa.e2e.mjs
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f apps/web/e2e/semilla-kiosco.sql
node apps/web/e2e/kiosco.e2e.mjs
```

## Limitaciones conocidas

- **iPhone:** la PWA no sincroniza en segundo plano. Las checadas sin conexión se envían cuando el trabajador vuelve a abrir la app.
- **Si se puede salir durante la pausa** (art. 64) lo define `centros_trabajo.pausa_puede_salir`, y la base lo impone tanto en la PWA como en el kiosco.
- **Suplantación en el kiosco:** quien conozca el número y el PIN de un compañero puede checar por él. Para mitigarlo hace falta foto al checar o biometría (con consentimiento expreso, por la LFPDPPP).
- **PINs en la cola sin conexión del kiosco:** las checadas pendientes guardan número y PIN en el dispositivo hasta enviarse; si una se rechaza, el PIN se borra. Mitigación: mantener el kiosco con la pantalla anclada y conexión estable.
- **Cualquiera frente al kiosco podría cerrar la sesión** desde las herramientas del navegador. Conviene usar el modo de app fija de Android o el Acceso guiado de iPad.
- Si un usuario está vinculado a varios empleadores, se muestra solo el primero.
- **La PWA pide correo.** Quien no tenga correo usa el kiosco con PIN. SMS o WhatsApp siguen como opción futura (con costo por mensaje).
