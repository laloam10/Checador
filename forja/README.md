# Asistente de Checador en Forja

Configuración del bot de Forja que atiende, en el WhatsApp de Checador, a quien **no** es un trabajador
registrado (prospectos y curiosos). Las checadas, la activación y la conformidad las atiende Checador con
reglas fijas; los mensajes de trabajadores nunca llegan a este bot. Contexto: `docs/publicacion.md` §1.9.

Aquí solo vive lo que es de Checador. La plantilla de Forja no se copia al repositorio: se instala con su CLI.

| Archivo | Qué es |
|---|---|
| `member/config.local.ts` | Datos del negocio y **reglas del asistente** (lo que no debe decir ni hacer) |
| `member/kb/*.md` | Base de conocimiento: qué es Checador, cómo se checa por WhatsApp, preguntas frecuentes |
| `aplicar.sh` | Copia lo anterior a una instalación de Forja y pone el nombre del bot |

Comprobado contra la plantilla 1.0.77: compila, genera la base de conocimiento y acepta los mensajes que
Checador firma y reenvía.

## Pasos (en tu computadora)

Ningún secreto se pega en un chat ni se guarda en un archivo: van con `wrangler secret put`, que los pide oculto.

1. **Instala el bot** con el CLI de Forja (`npx forjabot init`) y anota la carpeta que crea.
2. **Aplica esta configuración**, con un correo al que el asistente pueda remitir a un prospecto:
   ```bash
   forja/aplicar.sh <carpeta-del-bot> contacto@tu-dominio.mx
   ```
3. **Provisiona y publica** siguiendo la fase 1 de Forja (base D1, Vectorize, `pnpm run deploy`). Cloudflare pide
   una tarjeta para Vectorize aunque el uso quede en $0.
4. **Guarda los secretos** en la carpeta del bot, uno por uno:
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   Repite con `DASHBOARD_PASSWORD`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` y
   `KB_REINDEX_TOKEN` (este último lo inventas: `openssl rand -hex 24`).
   - Los tres de WhatsApp son **los mismos valores** que usa Checador (`WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN`,
     `WHATSAPP_APP_SECRET`). Checador firma cada mensaje con ese secreto y Forja lo verifica.
   - **No guardes `WHATSAPP_VERIFY_TOKEN` ni `META_VERIFY_TOKEN`.** Sin ellos, Forja rechaza el registro de su
     webhook en Meta, que es justo lo que se quiere (ver "Lo que no debes hacer").
5. **Carga la base de conocimiento** (los archivos de `member/kb/` no se indexan solos):
   ```bash
   pnpm kb:reindex && pnpm run deploy
   ```
   ```bash
   curl -X POST https://<tu-bot>.workers.dev/kb/reindex -H "X-Reindex-Token: <KB_REINDEX_TOKEN>"
   ```
   Debe responder `{"ok":true,"indexed":7,...}`. Alternativa sin comandos: pegar los tres documentos en el panel
   del bot, en **Conocimiento → Agregar documento**.
6. **Avisos al dueño.** Para que el asistente pueda pasar una conversación a una persona, configura en Forja el
   canal de aviso (por omisión Telegram: `OWNER_TELEGRAM_CHAT_ID`). Sin eso, pedir "hablar con alguien" no avisa a nadie.
7. **Presupuesto.** En el panel del bot, pestaña **Costos**, fija un presupuesto mensual de IA.
8. **Conecta Checador.** En Vercel (entorno de la rama que estés probando) agrega
   `FORJA_WEBHOOK_URL=https://<tu-bot>.workers.dev/webhooks/whatsapp` y vuelve a desplegar.
9. **Prueba** desde un celular que **no** esté en ninguna ficha de Checador: escribe "¿Qué es Checador?" al
   número. Debe responder el asistente. Con el número de prueba de Meta, ese celular tiene que estar en la
   lista de destinatarios permitidos (máximo 5); si no, Meta rechaza la respuesta con el error 131030.

## Lo que no debes hacer

- **No registres en Meta el webhook de Forja**, aunque su asistente de instalación o su panel lo pidan y aunque
  la conexión de WhatsApp aparezca "sin conectar". Meta entrega a una sola URL por app y debe ser la de
  Checador (`/api/whatsapp/webhook`). Si se cambia, las checadas dejan de registrarse sin ningún aviso.
- No quites de `config.local.ts` las reglas de `reglasYEscalacion` (no prometer cumplimiento, no dar asesoría
  legal, no pedir PIN ni códigos). Si editas la información del negocio en el panel de Forja, lo del panel puede imponerse a este archivo:
  revisa que las prohibiciones sigan ahí.
- No le des a este bot herramientas que lean o escriban registros de Checador sin revisarlo antes: hoy no
  tiene acceso a ningún dato de empresas ni de trabajadores, y así debe seguir mientras no se diseñe ese acceso.

## Al actualizar

`forjabot update` no toca `member/`. Si cambian estos archivos en el repositorio, vuelve a correr
`aplicar.sh` (deja un respaldo del anterior en `member/.respaldo-*`) y repite el paso 5.
