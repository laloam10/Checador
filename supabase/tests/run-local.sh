#!/usr/bin/env bash
# Prueba las migraciones en un PostgreSQL local (sin Docker ni Supabase CLI).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=checador_test
dropdb --if-exists "$DB" >/dev/null
createdb "$DB"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
"${PSQL[@]}" -f 00_shim_supabase.sql
# EXPONER_TABLAS=1 (por omisión) simula "Automatically expose new tables" activada; 0, desactivada.
[ "${EXPONER_TABLAS:-1}" = 1 ] && "${PSQL[@]}" -f 00b_exponer_tablas.sql
for f in ../migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
for f in [1-9][0-9]_*.sql; do "${PSQL[@]}" -f "$f"; done
# La verificación de seguridad debe devolver cero hallazgos.
HALLAZGOS=$("${PSQL[@]}" -tA -F' | ' -f ../verificar-seguridad.sql)
if [ -n "$HALLAZGOS" ]; then
  echo "HALLAZGOS DE SEGURIDAD:"; echo "$HALLAZGOS"; exit 1
fi
echo "Verificación de seguridad: sin hallazgos."
echo "Todas las pruebas de base de datos pasaron."
