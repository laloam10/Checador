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

## Panel del empleador (`/panel`)

1. **Alta de empresa** (`/alta-empresa`): el dueño entra con su correo, registra la razón social, el RFC opcional y su primer centro. Queda como propietario.
2. **Tablero:** quién está trabajando o en pausa ahora, trabajadores activos, objeciones por atender y verificación de integridad de la bitácora.
3. **Trabajadores:** alta, edición (incluida la jornada pactada por día, art. 58), PIN para el kiosco y baja. La baja nunca borra registros (art. 804).
4. **Registros y correcciones:** la misma tabla semanal que ve el trabajador, más la bitácora completa con su origen (celular, kiosco o panel). Se puede **corregir una hora**, **anular** o **agregar una checada faltante**, siempre con motivo; el registro original se conserva y queda visible.
5. **Objeciones:** semanas que el trabajador objetó y aún no vuelve a confirmar.
6. **Centros:** zona horaria y si se puede salir durante la pausa (art. 64).
7. **Accesos:** invitaciones por correo para administradores, supervisores y kioscos. Al entrar con ese correo, el acceso se activa solo.

Permisos:
- **Propietario:** todo.
- **Administrador:** todo excepto invitar o quitar administradores.
- **Supervisor:** consulta y corrige checadas, pero no da de alta trabajadores ni gestiona accesos.

## Acuerdo de registro electrónico (art. 132 fr. XXXIV)

El registro hace **prueba plena** si se acredita que fue acordado entre las partes. Flujo:

1. En la ficha del trabajador, el empleador **revisa el texto** (generado desde los datos actuales: método de registro, jornada pactada, descanso, regla de pausa) y **firma primero**.
2. La persona trabajadora lo firma de una de tres formas:
   - **App:** aviso en su pantalla de inicio y sección **Acuerdo**, con su cuenta verificada por correo.
   - **Kiosco:** tras su número y PIN aparece "Tienes un acuerdo por firmar" (4 minutos para leer).
   - **Papel:** el empleador imprime el acuerdo (con folio y huella SHA-256) y registra la firma autógrafa indicando dónde resguarda el original.
3. Con ambas firmas queda **vigente**. Si cambian la jornada, el descanso, la pausa o el método, el panel avisa y propone una nueva versión; la anterior sigue vigente hasta que ambos firmen la nueva.

La plantilla está en `lib/acuerdo.ts`. **Es una plantilla de referencia que debe revisar un abogado laboralista.** No incluye aceptación tácita (el silencio no implica conformidad), para no arriesgar la nulidad por renuncia de derechos (arts. 5 y 33 LFT). Cambiar la redacción exige incrementar `PLANTILLA_VERSION`.

## Exportación para inspección o juicio (`/panel/exportar`)

- **PDF por trabajador:** datos de la relación laboral, integridad de la bitácora al emitir, versiones del acuerdo con sus firmas, resumen semanal (con el acuerdo vigente y la conformidad de cada semana), registros incompletos y bitácora completa con la huella de cada registro.
- **CSV bitácora:** una fila por registro (incluidas correcciones y anulaciones), con horas locales y UTC y la huella de cada registro.
- **CSV resumen:** una fila por día y un total por semana, en minutos exactos y en h:mm.
- El periodo se ajusta a **semanas completas** (lunes a domingo), porque el tiempo extra es semanal. Máximo 53 semanas; "todos" solo en CSV.
- Incluye a trabajadores **dados de baja**: es el caso más común en un juicio.
- Cada archivo queda en `exportaciones` (solo inserción) con la huella SHA-256 del archivo y de los datos, quién lo emitió y el estado de la cadena. En **Verificar un archivo**, la huella se calcula en el navegador y se compara con el registro: un cambio de un solo bit se detecta.

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
node apps/web/e2e/panel.e2e.mjs
node apps/web/e2e/acuerdo.e2e.mjs
node apps/web/e2e/exportar.e2e.mjs   # requiere pdftotext (poppler-utils)
```

## Limitaciones conocidas

- **iPhone:** la PWA no sincroniza en segundo plano. Las checadas sin conexión se envían cuando el trabajador vuelve a abrir la app.
- **Si se puede salir durante la pausa** (art. 64) lo define `centros_trabajo.pausa_puede_salir`, y la base lo impone tanto en la PWA como en el kiosco.
- **Suplantación en el kiosco:** quien conozca el número y el PIN de un compañero puede checar por él. Para mitigarlo hace falta foto al checar o biometría (con consentimiento expreso, por la LFPDPPP).
- **PINs en la cola sin conexión del kiosco:** las checadas pendientes guardan número y PIN en el dispositivo hasta enviarse; si una se rechaza, el PIN se borra. Mitigación: mantener el kiosco con la pantalla anclada y conexión estable.
- **Cualquiera frente al kiosco podría cerrar la sesión** desde las herramientas del navegador. Conviene usar el modo de app fija de Android o el Acceso guiado de iPad.
- Si un usuario pertenece a varias empresas, el panel y la PWA muestran solo la primera.
- **El kiosco solo tiene teclado numérico:** los números de empleado con letras no podrán checar ahí (el panel lo advierte).
- **La PWA pide correo.** Quien no tenga correo usa el kiosco con PIN. SMS o WhatsApp siguen como opción futura (con costo por mensaje).
