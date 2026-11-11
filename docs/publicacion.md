# Guía de publicación segura

Cómo poner Checador en producción para un piloto con clientes reales, en **Supabase** (base de datos y acceso) y **Vercel** (aplicación web). Sigue los pasos en orden; cada uno dice cómo comprobar que quedó bien.

> **Antes de empezar.** Hay piezas que no son técnicas y que deben estar listas antes de dar acceso a un cliente: el aviso de privacidad, el contrato de servicio y la revisión legal de la plantilla del acuerdo. Ver la sección [7](#7-lo-legal-antes-del-piloto).

---

## 0. Qué vas a contratar y cuánto cuesta

| Servicio | Plan | Por qué no el gratuito | Costo aprox. |
|---|---|---|---|
| Supabase | **Pro** | El gratuito pausa el proyecto tras 1 semana sin actividad y no tiene respaldos diarios. Son registros que la ley obliga a conservar (art. 804). | desde 25 USD/mes |
| Vercel | **Pro** | El plan Hobby es solo para uso personal no comercial. | 20 USD/usuario/mes |
| Correo transaccional (SMTP) | Resend, Amazon SES, Brevo, Postmark… | **Obligatorio:** el correo integrado de Supabase solo entrega a los miembros del equipo del proyecto. Sin SMTP propio, ningún trabajador recibe su código. | 0–20 USD/mes según volumen |
| Dominio | p. ej. `checador.tuempresa.mx` | Dirección propia, profesional y con HTTPS. | ~15–40 USD/año |

**Total aproximado del piloto: 45–65 USD al mes.** Verifica los precios actuales en las páginas de cada servicio antes de contratar.

Crea **dos** proyectos de Supabase: `checador-produccion` y `checador-pruebas`. El de pruebas sirve para las vistas previas de Vercel y para ensayar migraciones y restauraciones sin tocar datos reales.

---

## 1. Supabase

### 1.1 Crear el proyecto

**Organización:** crea una exclusiva para el producto (p. ej. `Checador`) y súbela a **Pro**. No reutilices una organización que ya tenga otros proyectos: en Pro, **cada proyecto activo de la organización genera cargo de cómputo** (unos 10 USD/mes cada uno después del crédito incluido), y además mantienes separados la facturación y los accesos del producto.

Crea dos proyectos con esta configuración (pantalla *Create a new project*):

| Campo | Producción | Pruebas | Por qué |
|---|---|---|---|
| Project name | `checador-produccion` | `checador-pruebas` | |
| GitHub (optional) | **No conectar** | **No conectar** | Aplicaría migraciones de `main` a producción automáticamente, sin pasar antes por pruebas ni por la verificación de seguridad. |
| Database password | **Generate a password** y guárdala en tu gestor de contraseñas | igual (otra distinta) | Supabase no te la vuelve a mostrar. |
| Region | *Need a specific region?* → **East US (North Virginia)** `us-east-1` | la misma | Vercel ejecuta la app por omisión en `iad1`, la misma zona. |
| Enable Data API | ✅ Activado | ✅ | La app usa la API de Supabase. |
| Automatically expose new tables | ❌ **Desactivado** | ❌ | Recomendación de Supabase. Las migraciones otorgan permisos explícitos tabla por tabla (`…11…01_privilegios_explicitos.sql`); el CI prueba ambos modos. |
| Enable automatic RLS | ✅ Activado | ✅ | Red de seguridad extra: cualquier tabla nueva nace con RLS. Las migraciones ya lo activan. |
| Advanced configuration | Valores por omisión | igual | |

### 1.2 Aplicar las migraciones

Desde la carpeta del repositorio:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

Aplica las 10 migraciones de `supabase/migrations/`. Las dos últimas dejan los privilegios al mínimo: el rol anónimo sin acceso, y los usuarios sin permiso de modificar o borrar la evidencia.

**Alternativa sin la CLI** (solo HTTPS, sin conexión directa a la base): `scripts/migrar-api.py`. Usa la API de administración con un token (sección 1.6), registra las migraciones en el mismo historial que la CLI y corre la verificación de seguridad:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/migrar-api.py TU_PROJECT_REF --verificar
```

> ⚠️ **No uses `npx supabase config push`.** Subiría la configuración local de `supabase/config.toml` (por ejemplo, `site_url = http://127.0.0.1:3000`) a producción. La configuración de Auth se hace en el dashboard (paso 1.4).

### 1.3 Verificar la seguridad de la base

En el dashboard: **SQL Editor** → pega el contenido de [`supabase/verificar-seguridad.sql`](../supabase/verificar-seguridad.sql) → **Run**.

✅ **Debe devolver cero filas.** Cada fila es un hallazgo que se debe corregir antes de seguir. Revisa:

- que todas las tablas tengan RLS;
- que el rol anónimo no tenga acceso a tablas ni funciones;
- que las funciones privilegiadas fijen `search_path`;
- que las tablas de evidencia sean de solo inserción;
- que los PINs no sean legibles;
- que ningún rol tenga `TRUNCATE`, que no está sujeto a RLS.

Repite este paso **después de cada migración nueva**.

### 1.4 Configurar Auth (Authentication en el dashboard)

**URL Configuration**
- **Site URL:** `https://checador.tuempresa.mx`
- **Redirect URLs:** solo `https://checador.tuempresa.mx/**`

**Sign In / Providers → Email**
- **Enable Email provider:** encendido.
- **Confirm email:** **ENCENDIDO** (es el valor por omisión, no lo apagues). El script del paso 4 lo comprueba.
- **Email OTP Expiration:** `900` segundos (15 minutos; la plantilla lo menciona).
- **Email OTP Length:** `6`. Ojo: los proyectos nuevos traen **8**.
- Proveedores sociales (Google, etc.): apagados. Checador no los usa.

> **Por qué importa "Confirm email":** Supabase permite registrarse con contraseña llamando a su API. Si la confirmación estuviera apagada, alguien podría crear una cuenta con el correo de un trabajador o de un administrador invitado sin demostrar que es suyo. La base de datos ya tiene una segunda defensa: `vincular_mi_cuenta()` solo vincula cuentas cuya sesión se inició **con un código enviado al correo** (claim `amr = otp`). Aun así, la confirmación debe quedar encendida.

**Emails → SMTP Settings** (obligatorio)
1. Crea una cuenta en tu proveedor de correo, verifica tu dominio (registros SPF, DKIM y DMARC en tu DNS) y obtén las credenciales SMTP.
2. En Supabase: **Enable Custom SMTP**, remitente `Checador <no-responder@tuempresa.mx>`, y los datos del proveedor.
3. La contraseña SMTP vive solo en Supabase y en tu gestor de contraseñas.

**Emails → Templates**

> Supabase **no permite cambiar las plantillas** en proyectos gratuitos que usan su correo integrado: primero configura el SMTP propio (o sube a Pro).

En **Magic Link** y en **Confirm signup**:
- **Asunto:** `Tu código para Checador`
- **Cuerpo:** el contenido de [`supabase/templates/codigo.html`](../supabase/templates/codigo.html). Debe incluir `{{ .Token }}`: si la plantilla solo trae el enlace, nadie podrá entrar desde la app instalada.

**Rate Limits**
- **Emails por hora:** al dar de alta a una empresa, cada trabajador pide un código el mismo día. Sube el límite a algo como **100–200/hora**, sin pasar el límite de tu proveedor SMTP.
- Deja los demás valores por omisión.

> **CAPTCHA: NO lo actives todavía.** La pantalla de entrada no envía el token de CAPTCHA: activarlo bloquearía todos los accesos. Está anotado como mejora para cuando haya más clientes (sección 6).

**Todo lo anterior, salvo el SMTP, se aplica con un comando** y cada valor se verifica después de guardarse:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/configurar-auth.py TU_PROJECT_REF --site-url https://checador.tuempresa.mx
```

(Añade `--sin-plantillas` mientras no haya SMTP propio.)

### 1.5 Base de datos (Project Settings → Database)

- **Enforce SSL on incoming connections:** encendido.
- **Network restrictions:** permite conexiones directas a la base solo desde tus IPs de administración. La app y el CI no las necesitan: usan la API.
- **Llaves heredadas (Project Settings → API Keys):** desactiva las llaves *legacy* `anon` y `service_role` en formato JWT. Checador usa las llaves nuevas (*publishable*); la `service_role` heredada da acceso total y no caduca.

### 1.6 Token de administración (para automatizar la configuración)

Crea un token **con alcance** en *Account → Access Tokens*: tipo **Project**, solo los dos proyectos, preset **No access** y caducidad corta (no "Never"). Permisos mínimos:

| Categoría | Permiso | Nivel |
|---|---|---|
| Project | Project Settings (Supabase lo llama `project_admin_write`; lo exige la configuración de Auth) | Read-write |
| Project | Advisors · Logs | Read |
| Database | Database · Migrations · SSL Enforcement | Read-write |
| Application services | API Keys | Read |
| Application services | Auth Config | Read-write |

Todo lo demás en **None**, en especial: Backups (permite restaurar y sobrescribir la base), API Key Secrets, Database/Platform Webhooks (envían datos a terceros), Billing y Members. **Revócalo al terminar.**

### 1.7 Asesor de seguridad de Supabase

*Advisors → Security Advisor* reporta **20 avisos esperados**, que se aceptan a propósito:
- 1 informativo: `pines_trabajador` tiene RLS sin políticas, para que nadie pueda leer los PINs por la API.
- 18 de "función SECURITY DEFINER ejecutable por `authenticated`": son la API de la app (`crear_empresa`, `revertir_baja`, `vincular_mi_cuenta`, `verificar_cadena`, `asignar_pin`, `establecer_mi_pin`, `kiosco_identificar`, `kiosco_checar`, `kiosco_firmar_acuerdo`, `kiosco_semana`, `kiosco_conformidad`, `miembros_de_empresa`, `trabajadores_con_pin`), que validan por dentro quién las llama, y los auxiliares de RLS (`mi_rol`, `es_gestor`, `puede_consultar`, `soy_trabajador`, `trabajo_en`).
- 1 de "Leaked password protection disabled": compara contraseñas con filtraciones conocidas. Checador no usa contraseñas (todos entran con código por correo), y la función requiere el plan Pro.

**Cualquier otro aviso es nuevo y debe revisarse.** `verificar-seguridad.sql` contiene esa misma lista y marca como hallazgo cualquier función privilegiada ejecutable que no esté en ella.

### 1.8 Recordatorios de conformidad por correo

La migración `20261112000001_recordatorios_conformidad.sql` programa en **pg_cron** el envío cada lunes a las 16:00 UTC (10:00 en el centro de México), y `20261117000001` revisa **cada hora**, al minuto 20, lo que respondió Resend (pg_net guarda las respuestas solo unas horas). El correo sale desde la base con **pg_net**; la llave vive en **Supabase Vault**, nunca en la app ni en Vercel. **Sin los tres secretos de abajo no se envía nada.**

Qué se envía: un correo por persona con correo registrado que tenga semanas terminadas sin revisar (de las últimas 8) o semanas que objetó y que el empleador ya corrigió. Como máximo uno cada 6 días. Cada empresa puede apagarlos en el panel (**Objeciones → Recordatorios por correo**), donde también ve el resultado de cada envío.

1. **Llave de Resend solo para esto:** *API Keys → Create API Key*, permiso **Sending access**, dominio `checador.jemba.mx`. Una por proyecto: `checador-recordatorios-pruebas` y `checador-recordatorios-produccion`. No reutilices las llaves SMTP: si una se filtra, la revocas sin cortar los códigos de entrada.
2. **Secretos en cada proyecto:** *SQL Editor* → ejecuta con tus valores. La llave la escribes tú directamente ahí; no la pegues en chats ni en archivos.

   ```sql
   select vault.create_secret('re_...', 'checador_resend_llave');
   select vault.create_secret('https://checador.jemba.mx', 'checador_url_app');  -- pruebas: https://checador-pruebas.vercel.app
   select vault.create_secret('Reloj Checador <no-responder@checador.jemba.mx>', 'checador_remitente');
   ```

   Para cambiar uno después: `select vault.update_secret(id, 'nuevo valor') from vault.secrets where name = 'checador_resend_llave';`
3. **Comprueba:**

   ```sql
   select jobname, schedule from cron.job where jobname like 'checador-%';      -- 2 tareas
   select name from vault.secrets where name like 'checador_%';                 -- 3 secretos
   ```

4. **Prueba solo en `checador-pruebas`** (envía correos reales a quien tenga semanas pendientes):

   ```sql
   select public.enviar_recordatorios_conformidad();
   -- espera un minuto (o deja que la revisión de cada hora lo haga sola)
   select public.revisar_envios_recordatorios();
   select enviado_en, correo, estado, detalle from public.recordatorios_conformidad order by id desc limit 10;
   ```

   `estado = 'enviado'` significa que Resend lo aceptó; en *Resend → Emails* ves si se entregó. En producción no lo corras a mano: espera al lunes.

**Límite de Resend:** el plan gratuito permite unos **100 correos al día**, y el lunes se suman a los códigos de entrada de ese día. Si un lunes hay más personas pendientes, Resend rechaza el lote completo: el panel muestra "no se pudo enviar" y se reintenta el lunes siguiente (con el mismo problema). Sube a un plan de pago **antes** de tener ~80 trabajadores con correo en total.

---

### 1.9 Checada por WhatsApp (opcional)

Un solo número de WhatsApp atiende a todas las empresas. Meta entrega cada mensaje a `/api/whatsapp/webhook`; la app
verifica la firma y registra con reglas fijas (sin IA). Si falta cualquier variable, el canal queda apagado (503).

1. **Meta** (developers.facebook.com): crea una app de tipo *Business*, agrega el producto **WhatsApp** y anota el
   *identificador del número de teléfono* y la *clave secreta de la app* (Configuración → Básica). Para producción crea
   un **usuario del sistema** con un token permanente con permiso `whatsapp_business_messaging` (el token temporal dura 24 h).
2. **Secreto de servicio**: genera uno (`openssl rand -hex 32`) y guárdalo en dos lugares:
   - Supabase → SQL Editor: `select public.configurar_secreto_servicio('whatsapp', '<secreto>');` (solo se guarda su huella SHA-256).
   - Vercel → variable `WHATSAPP_SECRETO_SERVICIO` (ámbito del entorno que corresponda).
3. **Vercel**: agrega además `WHATSAPP_VERIFY_TOKEN` (un texto que inventas), `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN` y
   `WHATSAPP_PHONE_ID`. Opcional: `WHATSAPP_NUMERO` (el número de WhatsApp con código de país, solo dígitos; no es
   secreto) para que la ficha muestre el QR y el enlace de activación. Ninguna lleva prefijo `NEXT_PUBLIC_`. Vuelve a desplegar.
4. **Webhook en Meta** (WhatsApp → Configuración): URL `https://<dominio>/api/whatsapp/webhook`, el mismo token de
   verificación, y suscribe el campo **messages**.
5. **Prueba**: captura tu celular en la ficha de un trabajador de prueba, pulsa **Generar código de activación**, escribe
   ese código al número y sigue el flujo (código → Entrada). Hazlo en el proyecto de pruebas, nunca con datos de prueba
   en producción (la bitácora es inmutable).

La activación no usa el PIN del kiosco: un PIN es reutilizable y quedaría escrito en el chat. El código sirve una vez,
vence en 24 horas, se anula al quinto intento fallido y está atado al celular capturado.

**Conformidad semanal.** Cuando la persona checa y tiene semanas terminadas sin responder, el bot le ofrece
"Revisar semana": muestra los turnos y el total, y pide "Estoy conforme" o "No es correcto" (la objeción se escribe en
el siguiente mensaje). El bot **no puede escribir primero**: WhatsApp solo permite responder dentro de las 24 horas
siguientes al último mensaje de la persona, salvo con plantillas aprobadas y de pago, que no se usan. Por eso los
recordatorios de conformidad siguen saliendo por correo (1.8); quien solo usa WhatsApp y no checa, no recibe aviso.

**Asistente para quien no es trabajador (Forja, opcional).** Los mensajes de números que no están en ninguna ficha
(prospectos, curiosos) se reenvían a un bot de Forja publicado en tu Cloudflare; ese bot responde por su cuenta. Los
mensajes de trabajadores registrados **nunca** se reenvían: pueden ser una checada o una objeción.

La configuración del asistente (datos, reglas y base de conocimiento) y los pasos detallados están en
`forja/README.md`. En resumen:

1. Publica el bot con `npx forjabot` y configúrale el **mismo** número: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` y
   `WHATSAPP_APP_SECRET` iguales a los de Checador (Checador vuelve a firmar cada mensaje con ese secreto).
2. **No registres el webhook de Forja en Meta.** Meta solo entrega a una URL por app y debe seguir siendo la de
   Checador; si la cambias, se dejan de registrar las checadas.
3. En Vercel agrega `FORJA_WEBHOOK_URL=https://<tu-bot>.workers.dev/webhooks/whatsapp` y vuelve a desplegar. Sin esa
   variable, los números desconocidos reciben una respuesta fija.
4. Instrucciones mínimas para el bot (en el panel de Forja). Ajusta el texto, pero conserva las prohibiciones:
   - Eres el asistente de Checador, un sistema de registro electrónico de jornada para empresas en México.
   - Explica qué hace el producto y cómo pedir una demostración. No inventes precios ni funciones.
   - **No digas que Checador garantiza o certifica el cumplimiento de la ley**, ni des asesoría legal: sugiere
     consultar a un abogado laboralista.
   - No puedes registrar entradas ni salidas, ni consultar registros de nadie. Si alguien quiere checar y recibe
     esta respuesta, su empresa aún no capturó su celular: que lo pida a su empresa.
   - No pidas ni aceptes PIN, códigos de activación ni contraseñas.

Límites: 20 mensajes por hora por número y 300 por hora en total; al pasar el límite se avisa una vez y luego no se
responde. Si Forja no contesta en 8 segundos, la persona recibe la respuesta fija. De quien no es usuario solo se guarda
la huella del teléfono, un día. Además, fija un presupuesto mensual de IA en el panel de Forja.

Por qué un secreto de servicio: el webhook no tiene sesión de usuario y la app nunca usa la llave `service_role`. Las
funciones `whatsapp_*()` son las únicas ejecutables sin sesión y no hacen ni revelan nada sin ese secreto;
`verificar-seguridad.sql` comprueba que todas lo exijan. Para rotarlo, repite el paso 2 (primero la base, luego Vercel).

Antes de ofrecerlo a clientes: el aviso de privacidad debe mencionar el número de celular y la transmisión por WhatsApp
(Meta), y el acuerdo de registro incluye el método solo para quien tiene celular capturado (esos acuerdos quedan
"desactualizados" hasta que se firme la nueva versión).

## 2. Vercel

### 2.1 Importar el proyecto

1. En https://vercel.com/new, importa `laloam10/Checador`, en tu equipo con plan **Pro**.
2. **Root Directory:** `apps/web`. Deja activada la opción de incluir archivos fuera de esa carpeta, porque la app usa `packages/jornada`.
3. **Framework:** Next.js (se detecta solo). **Node.js:** 22.x (Project Settings → General).
4. Los comandos de instalación y compilación se dejan por omisión. npm instala el monorepo desde la raíz.

### 2.2 Variables de entorno

Solo dos, y ninguna es secreta:

| Variable | Producción | Preview y Development |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto **de producción** | URL del proyecto **de pruebas** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave *publishable* de producción | Llave *publishable* de pruebas |

> ⚠️ **Nunca** pongas la llave `secret` / `service_role` en Vercel. La app no la usa (lo verificamos en el código) y saltaría toda la protección de RLS.
>
> **Las vistas previas (Preview) no deben apuntar a producción:** cada rama genera una URL pública. Además, en **Project Settings → Deployment Protection** activa la protección para las vistas previas.

### 2.3 Región de las funciones

**Project Settings → Functions → Function Region:** la misma región que Supabase. Por ejemplo, `iad1` para `us-east-1` o `sfo1` para `us-west-1`. Cada consulta cruza entre Vercel y Supabase, así que estar en la misma región evita latencia innecesaria al checar.

### 2.4 Dominio

1. **Project Settings → Domains** → agrega `checador.tuempresa.mx` y crea en tu DNS el registro que indique Vercel.
2. HTTPS se configura solo.
3. La app envía `Strict-Transport-Security` con `includeSubDomains; preload`. Antes de enviar tu dominio a la lista *preload* de los navegadores, asegúrate de que **todos** tus subdominios funcionen con HTTPS. Si no estás seguro, no lo envíes: la cabecera funciona igual sin estar en esa lista.

---

## 3. Seguridad que ya trae la aplicación

No requiere configuración; aquí está para que sepas qué verificar:

| Protección | Dónde | Cómo se comprobó |
|---|---|---|
| **Content Security Policy** con *nonce* por petición: solo se ejecutan scripts propios y solo se conecta al propio dominio y a Supabase | `apps/web/proxy.ts` | Un script inyectado en el HTML no se ejecuta; sin CSP, sí (control negativo). Prueba `e2e/csp.e2e.mjs` en 13 pantallas. |
| HSTS, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy` (sin cámara ni ubicación), sin `X-Powered-By` | `apps/web/next.config.ts` | `scripts/verificar-despliegue.sh` |
| RLS en todas las tablas; el rol anónimo sin privilegios; sin `TRUNCATE` | migraciones | `supabase/verificar-seguridad.sql` (cero hallazgos) y el CI |
| Bitácora encadenada con SHA-256, solo inserción | migraciones | 127 pruebas SQL; detección de alteraciones |
| Vincular cuentas solo con sesión iniciada por código | `vincular_mi_cuenta()` | Ataque reproducido y bloqueado, con y sin "Confirm email" |
| PIN de kiosco con bcrypt y bloqueo por intentos | migraciones | Pruebas SQL y de punta a punta |
| Evidencia (IP, dispositivo) tomada en el servidor | rutas `/api` | Pruebas de punta a punta |
| Dependencias de producción y de desarrollo | `package-lock.json` | `npm audit`: 0 vulnerabilidades |

---

## 4. Verificar el despliegue

Con la app publicada, desde tu equipo:

```bash
APP_URL=https://checador.tuempresa.mx \
SUPABASE_URL=https://TU_PROJECT_REF.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
./scripts/verificar-despliegue.sh
```

✅ Debe terminar en **"Despliegue verificado: sin fallas."** Revisa 40 puntos desde fuera, como lo haría un atacante:
- HTTPS y HSTS;
- la CSP y que el *nonce* cambie en cada petición;
- las demás cabeceras de seguridad;
- que sin sesión no se pueda checar, exportar ni usar el kiosco;
- que el reloj del servidor sea correcto;
- que el rol anónimo no pueda leer ni ejecutar nada en Supabase;
- que Auth exija confirmar el correo.

**Revisión automática semanal:** en GitHub → Settings → Secrets and variables → Actions → **Variables**, crea `APP_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. El flujo `.github/workflows/verificar-produccion.yml` repite la verificación cada lunes y puedes lanzarlo a mano. Si alguien apaga una protección, el flujo falla y GitHub te avisa.

### Prueba de humo (manual, 15 minutos)

1. Desde tu celular, abre la dirección, entra con tu correo (debe llegar el código) y **registra tu empresa**.
2. Da de alta un trabajador de prueba con otro correo tuyo y con número de empleado y PIN.
3. Invita un kiosco con un tercer correo y entra con él en otra pestaña en `/kiosco`.
4. Desde el celular del "trabajador": entra, **agrega la app a la pantalla de inicio**, checa entrada y salida, y firma el acuerdo.
5. En el kiosco, checa con el número y el PIN.
6. En el panel: tablero, corrección con motivo, exportación en PDF y **Verificar ahora**.
7. Da de baja al trabajador de prueba (sus registros se conservan).

---

## 5. Operación

### Publicar cambios

Hay dos ramas con dirección fija:

| Rama | Dirección | Base de datos |
|---|---|---|
| `pruebas` | https://checador-pruebas.vercel.app (privada: pide iniciar sesión en Vercel) | `checador-pruebas` |
| `main` | https://checador.jemba.mx | `checador-produccion` |

Los datos de producción no se pueden borrar de la bitácora, así que **todo se prueba primero en `pruebas`**: sube el cambio a esa rama, revísalo en la dirección de pruebas y, solo entonces, llévalo a `main`.

> Si una rama apunta a un commit que Vercel ya desplegó (por ejemplo, al crearla igual a `main`), no se compila sola: lanza el despliegue desde el panel de Vercel o con un commit nuevo.

1. Si hay migraciones nuevas: aplícalas primero en **pruebas**, después en producción (`npx supabase db push`) y corre de nuevo `verificar-seguridad.sql`.
2. Después haz `git push` a `main`: Vercel publica solo, y el CI corre las pruebas.
3. Corre `verificar-despliegue.sh`.

Las migraciones van **antes** que el código que depende de ellas. Nunca modifiques una migración ya aplicada en producción: crea una nueva.

### Respaldos
- Supabase Pro guarda respaldos diarios por 7 días.
- La ley obliga a conservar durante la relación laboral **y un año después** (art. 804). Haz además un respaldo propio **cada semana**:

  ```bash
  DB_URL='(cadena de conexión de Supabase)' ./scripts/respaldo.sh
  ```

  Cifra la carpeta resultante y guárdala fuera de Supabase (otro proveedor de almacenamiento).
- **Cada trimestre, restaura un respaldo en el proyecto de pruebas** y ejecuta en el panel "Verificar ahora": un respaldo que nunca se ha restaurado no es un respaldo.

### Monitoreo
- **Vercel → Logs:** errores de la app.
- **Supabase → Logs:** Auth (códigos enviados, rechazos) y la base de datos.
- Si "Verificar ahora" muestra una **alteración de la bitácora**: no corrijas nada. Exporta, conserva los registros del servidor y revisa quién tuvo acceso directo a la base.

### Cuentas de administración
- Activa la verificación en dos pasos en GitHub, Vercel, Supabase, tu proveedor de correo y tu DNS. **Quien controle tu correo o tu DNS controla los códigos de acceso.**
- Da acceso al dashboard de Supabase solo a quien lo necesite.

---

## 6. Pendientes de seguridad conocidos (para después del piloto)

| Pendiente | Riesgo | Mitigación actual |
|---|---|---|
| CAPTCHA en la pantalla de entrada | Que alguien pida muchos códigos para saturar correos | Límites de Supabase y del proveedor SMTP |
| Suplantación en el kiosco (un compañero conoce el PIN de otro) | Registros falsos | Bloqueo por intentos, bitácora, conformidad semanal |
| PINs de checadas sin conexión guardados en el dispositivo del kiosco | Lectura con acceso físico | Se borran al enviarse; usar la tableta en modo de app fija |
| Las cuentas de administración dependen de la seguridad de su correo | Robo de la cuenta | 2FA en el correo; códigos de 15 minutos |
| Constancias NOM-151 de un tercero | Una reescritura completa de la base no se detectaría desde dentro | Comprobante de conformidad con el hash para el trabajador; exportaciones registradas |

---

## 7. Lo legal antes del piloto

No son tareas de código, pero sin ellas no deberías dar acceso a un cliente:

1. **Aviso de privacidad.** El empleador es el *responsable* de los datos de su personal y tú eres el *encargado*. Debe decir qué datos se tratan (los de la cláusula novena del acuerdo), para qué (incluidos los recordatorios semanales por correo), y que se almacenan en servidores fuera de México. La app remite al aviso del empleador.
2. **Contrato de servicio con cada cliente**, que incluya la **cláusula de encargado del tratamiento** (qué haces con los datos, confidencialidad, qué pasa al terminar el contrato) y deje claro que el sistema es una herramienta, no asesoría legal.
3. **Revisión de la plantilla del acuerdo** (`apps/web/lib/acuerdo.ts`) y de `docs/analisis-legal.md` por un abogado laboralista.
4. **Disposiciones de la STPS:** entran en vigor el 1 de enero de 2027. Al publicarse, revisa si piden un formato de entrega o eximen a algún tamaño de empresa.
