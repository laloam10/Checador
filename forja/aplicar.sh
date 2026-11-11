#!/usr/bin/env bash
# Aplica la configuración del asistente de Checador sobre una instalación de Forja.
#
# Uso:  forja/aplicar.sh <carpeta-del-bot-de-forja> <correo-de-contacto>
#   <carpeta-del-bot-de-forja>  la que creó `npx forjabot init` (tiene wrangler.toml y member/)
#   <correo-de-contacto>        correo al que el asistente puede remitir a un prospecto
#
# Solo toca member/ (que Forja nunca sobrescribe al actualizar) y dos nombres en wrangler.toml.
# No maneja secretos: esos se guardan con `wrangler secret put` (ver forja/README.md).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
BOT="${1:-}"
CORREO="${2:-}"

if [ -z "$BOT" ] || [ -z "$CORREO" ]; then
  echo "Uso: $0 <carpeta-del-bot-de-forja> <correo-de-contacto>" >&2; exit 2
fi
if [ ! -f "$BOT/wrangler.toml" ] || [ ! -d "$BOT/member" ]; then
  echo "No parece una instalación de Forja: falta wrangler.toml o member/ en $BOT" >&2; exit 1
fi
if ! printf '%s' "$CORREO" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then
  echo "El correo de contacto no es válido: $CORREO" >&2; exit 1
fi

RESPALDO="$BOT/member/.respaldo-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESPALDO"
[ -f "$BOT/member/config.local.ts" ] && cp "$BOT/member/config.local.ts" "$RESPALDO/"
[ -d "$BOT/member/kb" ] && cp -r "$BOT/member/kb" "$RESPALDO/kb"

sed "s|__CORREO_DE_CONTACTO__|$CORREO|" "$AQUI/member/config.local.ts" > "$BOT/member/config.local.ts"
mkdir -p "$BOT/member/kb"
cp "$AQUI"/member/kb/*.md "$BOT/member/kb/"

# Nombre público del bot y del negocio (variables no secretas de wrangler.toml).
sed -i.bak -E \
  -e 's|^BOT_NAME = ".*"|BOT_NAME = "Asistente de Checador"|' \
  -e 's|^BUSINESS_NAME = ".*"|BUSINESS_NAME = "Checador"|' "$BOT/wrangler.toml"
rm -f "$BOT/wrangler.toml.bak"

echo "Listo. Configuración aplicada en $BOT"
echo "  - member/config.local.ts (respaldo del anterior en $RESPALDO)"
echo "  - member/kb/: $(ls "$AQUI"/member/kb/*.md | wc -l | tr -d ' ') documentos"
echo "  - wrangler.toml: BOT_NAME y BUSINESS_NAME"
echo "Sigue con forja/README.md, paso 3."
