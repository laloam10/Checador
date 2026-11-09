# Stack técnico (ADR-001)

> **Estado:** aceptada (2026-11-05) y construida. La tabla de abajo describe lo que está en el código (actualizada el 2026-11-09). Desarrollo a cargo del dueño del producto con Claude Code.

## Requisitos que deciden el stack

Vienen de [analisis-legal.md](analisis-legal.md) y [mvp.md](mvp.md):

1. **Multiempresa (SaaS):** muchas PYMEs en una sola instalación, con aislamiento estricto de datos entre clientes.
2. **Captura desde celulares Android de gama baja y desde un kiosco compartido**, sin hardware propio.
3. **Hora del servidor como fuente de verdad**, con captura sin conexión marcada como "diferida".
4. **Bitácora inmutable** que se pueda verificar: si alguien altera un registro, debe detectarse.
5. **Firma electrónica** del acuerdo y de las conformidades, con evidencia (prueba plena, art. 132 XXXIV).
6. **Motor de cálculo** con las tablas de transición 2026 a 2030. Es la parte con más riesgo de errores.
7. **Exportación PDF/CSV con hash** para inspección o juicio.
8. **Costo bajo y equipo pequeño:** una o dos personas.

## Decisión

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** en todo el stack | Un solo lenguaje en frontend, backend y motor de cálculo; tipos estrictos para las reglas legales |
| Web y API | **Next.js** (App Router) | Panel del patrón, portal del trabajador y kiosco en un solo proyecto |
| App del trabajador | **PWA** (no app nativa) | Sin tiendas de apps ni costo de publicación. Se instala desde el navegador. Con IndexedDB guarda registros sin conexión |
| Base de datos | **PostgreSQL** | Row Level Security para aislar a cada cliente; permisos para que la bitácora solo acepte inserciones; transacciones fiables |
| Acceso a datos | **Cliente de Supabase** (`@supabase/supabase-js` y `@supabase/ssr`), sin ORM. Esquema en **migraciones SQL** (`supabase/migrations`) | Las políticas RLS, los triggers de la bitácora y las funciones `security definer` se escriben en SQL de todos modos; un ORM no aportaba. La lógica sensible (PIN del kiosco, firma de acuerdos, alta de empresa) vive en funciones de Postgres, no en la app. *Se había propuesto Drizzle; se descartó al construir.* |
| Autenticación | **Supabase Auth** con **código de 6 dígitos por correo** para todos (dueño, administradores, supervisores, trabajadores y kiosco). Sin contraseñas | Una sola forma de entrar, sin contraseñas que olvidar o reutilizar. Quien no tiene correo checa en el **kiosco** con número de empleado y PIN (bcrypt en Postgres). La vinculación de cuenta exige haber entrado con código (claim `amr`). *Se había propuesto contraseña para el patrón; se descartó.* |
| Motor de cálculo | **Paquete TypeScript puro** (`packages/jornada`), sin dependencias, con pruebas en **Vitest** | Se prueba de forma aislada con casos tomados directamente de los arts. 59, 66 y 68 y de los transitorios |
| PDF | **pdf-lib**, generado en el servidor | Constancias y reportes con el hash SHA-256 impreso |
| Hosting | **Vercel** para la app (funciones en `iad1`) y **Supabase** para Postgres (`us-east-1`), en la misma zona | Costo bajo al inicio y poca latencia entre la app y la base. La LFPDPPP no obliga a guardar los datos en México, pero hay que declararlo en el aviso de privacidad. Ver la revisión de Cloudflare más abajo |
| Correo | **Resend** como SMTP de Supabase Auth, remitente `no-responder@checador.jemba.mx` | Hoy solo envía los códigos de entrada. **No hay recordatorios**: la conformidad semanal se ve en la app del trabajador. Recordatorios por correo o **WhatsApp** quedan para después (WhatsApp Business API cobra por conversación) |

### Integridad de la bitácora

- Tabla `eventos` de **solo inserción**: el rol de la aplicación no tiene permisos `UPDATE` ni `DELETE`.
- Cada evento guarda `hash = SHA-256(evento + hash_anterior)` por empresa, formando una **cadena de hashes**. Si alguien altera un registro, la cadena se rompe y se detecta.
- Las correcciones no modifican el evento original: se agrega un nuevo evento que lo corrige, con motivo, autor y valor anterior.
- **Fase 2 (opcional):** obtener una constancia de conservación **NOM-151-SCFI-2016** con un Prestador de Servicios de Certificación para los acuerdos y los cierres periódicos. No lo exige la LFT, pero da un sello de tiempo de un tercero reconocido y refuerza la prueba. Tiene costo por constancia, así que podría ser una función del plan premium.

### Captura sin conexión

- El dispositivo guarda la hora local y la diferencia con la hora del servidor, medida en la última sincronización.
- Al sincronizar, el servidor guarda **ambas horas** y marca el registro como "diferido". Nunca se reescribe la hora original.
- Limitación: en iPhone, una PWA no sincroniza en segundo plano; lo hace al abrirse. Hay que documentarlo para el cliente.

## Alternativas descartadas

- **App nativa (React Native o Flutter):** dobla el trabajo de publicación y mantenimiento. Solo vale la pena si se vuelve indispensable la biometría o el GPS en segundo plano, y ninguno está en el MVP.
- **Laravel (PHP):** buena opción **si quien desarrolla ya domina PHP**. Es la alternativa real a esta propuesta. Ver "Supuestos".
- **Firebase:** NoSQL hace más difícil la integridad relacional y la bitácora con permisos de solo inserción. Además, depende de un solo proveedor.
- **Bajo código (Bubble, AppSheet, etc.):** no permite garantizar inmutabilidad ni cadena de hashes, que son el núcleo del valor probatorio.

### Cloudflare en lugar de Vercel y Supabase (revisado el 2026-11-07)

**Decisión:** seguir con Vercel y Supabase. Cloudflare se usa solo para el DNS de `jemba.mx`, con los registros de Vercel **sin proxy** (nube gris). Vercel no recomienda poner su proxy delante.

**Supabase no tiene reemplazo en Cloudflare.** La seguridad de Checador vive en Postgres: RLS, roles, la bitácora de solo inserción con cadena de hashes (triggers y funciones `security definer`), la entrada con código por correo y la revisión del claim `amr`. Todo eso está cubierto por las pruebas de `supabase/tests` y por `verificar-seguridad.sql`. D1 es SQLite, sin roles ni RLS. Cloudflare tampoco tiene autenticación para usuarios finales: Access es para empleados. Mudarse obligaría a pasar esas protecciones al código de la app, donde un error sí podría saltárselas. Si algún día se cambia algo, sería solo el hosting de la app (Workers conectado al mismo Supabase), no la base.

**Vercel frente a Cloudflare Workers para la app:**

| | Vercel | Cloudflare Workers |
|---|---|---|
| Next.js 16 (`proxy.ts`, Server Actions, CSP con nonce por petición) | Soporte nativo | Por el adaptador OpenNext, que suele ir detrás de las versiones nuevas de Next; el entorno no es Node completo |
| Distancia a la base | Funciones en `iad1`, junto a Supabase `us-east-1` | Corre en el punto más cercano al usuario; cada consulta viaja a Virginia salvo con Smart Placement |
| Ambiente por rama (`pruebas`) | Ya configurado | Hay que configurarlo |
| Precio | Pro: 20 USD por miembro al mes más consumo | Del orden de 5 USD al mes, sin cobro por tráfico de salida |
| Firewall y protección contra ataques | Básico en Pro | Más completo e incluido |

**Volver a evaluar si se cumple alguno de estos criterios:**

1. La factura de Vercel por consumo pasa de unos 50 USD al mes, o crece más rápido que el número de clientes.
2. Se necesitan reglas de firewall o protección contra ataques más allá de lo que da Vercel.
3. OpenNext soporta Next 16 completo, sobre todo `proxy.ts`, Server Actions y el render dinámico con nonce. Sin esto, migrar pone en riesgo la parte más delicada.

**Un cambio de proveedor no resuelve la residencia de datos.** Si un cliente pide los datos en México, lo que cambia es la región de Supabase (y la de las funciones, para que sigan juntas), no el proveedor. Mientras tanto, la ubicación (Virginia, EE. UU.) se declara en el aviso de privacidad.

## Supuestos (a confirmar)

1. El desarrollo lo harán una o dos personas, con apoyo de Claude Code.
2. Nadie del equipo tiene una experiencia fuerte en otro stack que justifique cambiarlo, por ejemplo PHP o Laravel.
3. Presupuesto de infraestructura inicial menor a 50 USD al mes.

## Orden de construcción sugerido

1. `packages/jornada`: motor de cálculo con pruebas. No depende de la base de datos ni de la interfaz, y es donde un error cuesta más caro.
2. Esquema de Postgres: empresas, trabajadores, eventos (solo inserción), acuerdos y conformidades; políticas RLS.
3. Captura web (kiosco y PWA) y sincronización.
4. Acuerdo y conformidad con firma.
5. Reportes y exportación con hash.
