# @checador/web: PWA del trabajador

Aplicación Next.js 16 (App Router) instalable en el celular. El trabajador:

1. **Entra con un código de 6 dígitos** que recibe por correo (sin contraseña). Se usa código y no enlace mágico porque, en una PWA instalada, el enlace se abre en el navegador y no en la app.
2. **Registra entrada, pausas y salida.** La hora la fija el servidor.
3. **Sigue checando sin conexión.** La checada se guarda en el teléfono (IndexedDB) con la hora corregida según el desfase medido contra el servidor. Al volver la red se envía y queda marcada como **diferida**, con ambas horas.
4. **Consulta sus registros por semana:** turnos, pausas, horas extra, incidencias y alertas con su fundamento legal.
5. **Da su conformidad u objeta** cada semana terminada. El resumen se recalcula en el servidor y la respuesta queda anclada a la cadena de la bitácora, con un comprobante (n.º de registro y hash).

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
```

## Limitaciones conocidas

- **iPhone:** la PWA no sincroniza en segundo plano. Las checadas sin conexión se envían cuando el trabajador vuelve a abrir la app.
- **"Puedo salir durante la pausa"** lo marca el trabajador. Debería definirlo la configuración del centro de trabajo (pendiente del panel).
- Si un usuario está vinculado a varios empleadores, se muestra solo el primero.
- **Correo obligatorio:** muchos trabajadores no usan correo. Habrá que evaluar SMS o WhatsApp (tienen costo) o el kiosco con PIN.
