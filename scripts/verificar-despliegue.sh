#!/usr/bin/env bash
# =============================================================================
# Verificación de seguridad de un despliegue de Checador, desde fuera (como un atacante).
#
# Uso:
#   APP_URL=https://checador.tudominio.mx \
#   SUPABASE_URL=https://xxxx.supabase.co \
#   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
#   ./scripts/verificar-despliegue.sh
#
# Para probar en local sin HTTPS: LOCAL=1 (omite las verificaciones de HTTPS/HSTS).
# Para revisar solo Supabase (antes de publicar la app): SOLO_SUPABASE=1 (no requiere APP_URL).
# Sale con código 1 si alguna verificación falla.
# =============================================================================
set -uo pipefail
: "${SUPABASE_URL:?Falta SUPABASE_URL}" "${SUPABASE_PUBLISHABLE_KEY:?Falta SUPABASE_PUBLISHABLE_KEY}"
[ "${SOLO_SUPABASE:-0}" = 1 ] || : "${APP_URL:?Falta APP_URL (o usa SOLO_SUPABASE=1)}"
APP_URL=${APP_URL:-}; APP_URL=${APP_URL%/}; SUPABASE_URL=${SUPABASE_URL%/}; K=$SUPABASE_PUBLISHABLE_KEY
FALLAS=0
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
falla() { printf '  \033[31m✗ %s\033[0m\n' "$1"; FALLAS=$((FALLAS + 1)); }
revisa() { if eval "$2"; then ok "$1"; else falla "$1"; fi; }
cabecera() { grep -i "^$1:" <<<"$CABECERAS" | head -1 | cut -d' ' -f2- | tr -d '\r'; }

if [ "${SOLO_SUPABASE:-0}" != 1 ]; then
echo "== Aplicación: $APP_URL"
if [ "${LOCAL:-0}" != 1 ]; then
  revisa "se sirve por HTTPS" '[[ $APP_URL == https://* ]]'
  revisa "HTTP redirige a HTTPS" '[[ $(curl -s -o /dev/null -w "%{redirect_url}" "${APP_URL/https:/http:}/entrar") == https://* ]]'
fi
CABECERAS=$(curl -sI "$APP_URL/entrar")
CSP=$(cabecera content-security-policy)
revisa "/entrar responde 200" '[[ $(head -1 <<<"$CABECERAS") == *200* ]]'
revisa "CSP con nonce por petición y 'strict-dynamic'" '[[ $CSP == *"nonce-"* && $CSP == *strict-dynamic* ]]'
revisa "CSP no permite 'unsafe-eval' en producción" '[[ $CSP != *unsafe-eval* ]]'
revisa "CSP solo conecta al propio dominio y a Supabase" '[[ $CSP == *"connect-src '"'"'self'"'"' $SUPABASE_URL"* ]]'
revisa "CSP prohíbe incrustar la app en otros sitios" '[[ $CSP == *"frame-ancestors '"'"'none'"'"'"* ]]'
revisa "el nonce cambia en cada petición" '[[ $(curl -sI "$APP_URL/entrar" | grep -io "nonce-[^'"'"']*") != $(grep -io "nonce-[^'"'"']*" <<<"$CSP") ]]'
revisa "X-Frame-Options: DENY" '[[ $(cabecera x-frame-options) == DENY ]]'
revisa "X-Content-Type-Options: nosniff" '[[ $(cabecera x-content-type-options) == nosniff ]]'
revisa "Permissions-Policy bloquea cámara y ubicación" '[[ $(cabecera permissions-policy) == *"camera=()"* && $(cabecera permissions-policy) == *"geolocation=()"* ]]'
revisa "no revela la tecnología (sin X-Powered-By)" '[[ -z $(cabecera x-powered-by) ]]'
[ "${LOCAL:-0}" != 1 ] && revisa "HSTS de al menos un año" '[[ $(cabecera strict-transport-security) =~ max-age=([0-9]+) && ${BASH_REMATCH[1]} -ge 31536000 ]]'
revisa "sin sesión, / redirige a /entrar" '[[ $(curl -s -o /dev/null -w "%{redirect_url}" "$APP_URL/") == */entrar* ]]'
revisa "sin sesión, /panel redirige a /entrar" '[[ $(curl -s -o /dev/null -w "%{redirect_url}" "$APP_URL/panel") == */entrar?siguiente=%2Fpanel ]]'
revisa "sin sesión, registrar checada → 401" '[[ $(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "{}" "$APP_URL/api/eventos") == 401 ]]'
revisa "sin sesión, exportar → 401" '[[ $(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/exportar?formato=pdf") == 401 ]]'
revisa "sin sesión, kiosco → 401" '[[ $(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "{}" "$APP_URL/api/kiosco/checar") == 401 ]]'
HORA=$(curl -s "$APP_URL/api/hora" | python3 -c "import sys,json,datetime; print(json.load(sys.stdin)['horaServidor'])" 2>/dev/null)
revisa "reloj del servidor a menos de 60 s de este equipo" 'python3 -c "import datetime,sys; d=abs((datetime.datetime.fromisoformat(\"$HORA\".replace(\"Z\",\"+00:00\"))-datetime.datetime.now(datetime.timezone.utc)).total_seconds()); sys.exit(0 if d<60 else 1)"'
revisa "el service worker no se guarda en caché" '[[ $(curl -sI "$APP_URL/sw.js" | grep -i "^cache-control" | tr -d "\r") == *no-store* ]]'

fi

echo "== Supabase: $SUPABASE_URL"
AJUSTES=$(curl -s -H "apikey: $K" "$SUPABASE_URL/auth/v1/settings")
revisa "Auth exige confirmar el correo (mailer_autoconfirm = false)" '[[ $(python3 -c "import sys,json; print(json.load(sys.stdin).get(\"mailer_autoconfirm\"))" <<<"$AJUSTES") == False ]]'
for tabla in trabajadores eventos pines_trabajador acuerdos conformidades empresas exportaciones; do
  revisa "anónimo no puede leer $tabla" '[[ $(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $K" "$SUPABASE_URL/rest/v1/$tabla?select=*&limit=1") =~ ^(401|403)$ ]]'
done
revisa "anónimo no puede insertar eventos" '[[ $(curl -s -o /dev/null -w "%{http_code}" -X POST -H "apikey: $K" -H "Content-Type: application/json" -d "{}" "$SUPABASE_URL/rest/v1/eventos") =~ ^(401|403)$ ]]'
for fn in kiosco_identificar vincular_mi_cuenta verificar_cadena mi_rol; do
  revisa "anónimo no puede ejecutar $fn()" '[[ $(curl -s -o /dev/null -w "%{http_code}" -X POST -H "apikey: $K" -H "Content-Type: application/json" -d "{}" "$SUPABASE_URL/rest/v1/rpc/$fn") =~ ^(401|403|404)$ ]]'
done

echo
if [ $FALLAS -eq 0 ]; then echo "Despliegue verificado: sin fallas."; else echo "$FALLAS falla(s): corrígelas antes de dar acceso a clientes."; exit 1; fi
