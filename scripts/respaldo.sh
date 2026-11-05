#!/usr/bin/env bash
# =============================================================================
# Respaldo lógico de la base de producción de Checador.
#
# Los respaldos automáticos de Supabase Pro duran 7 días; la LFT (art. 804) obliga a
# conservar los registros durante la relación laboral y un año después. Este respaldo
# es la copia de largo plazo: guárdalo cifrado y fuera de Supabase.
#
# Uso:
#   DB_URL='postgresql://postgres.<ref>:<contraseña>@<host>:5432/postgres' ./scripts/respaldo.sh [carpeta]
#   (Supabase → Project Settings → Database → Connection string. NUNCA la guardes en el repositorio.)
#
# Genera: esquema.sql, datos.sql (incluye auth.users) y SHA256SUMS. Cifra la carpeta antes de subirla, p. ej.:
#   tar czf - respaldo-AAAA... | age -r <tu-llave-publica> > respaldo.tar.gz.age
# =============================================================================
set -euo pipefail
: "${DB_URL:?Falta DB_URL}"
DESTINO="${1:-respaldo-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$DESTINO"
umask 077
npx --yes supabase db dump --db-url "$DB_URL" -f "$DESTINO/esquema.sql"
npx --yes supabase db dump --db-url "$DB_URL" --data-only --schema public,auth -f "$DESTINO/datos.sql"
( cd "$DESTINO" && sha256sum esquema.sql datos.sql > SHA256SUMS )
echo "Respaldo en $DESTINO:"
cat "$DESTINO/SHA256SUMS"
echo "Siguiente paso: cífralo y guárdalo fuera de Supabase. Prueba restaurarlo al menos una vez por trimestre."
