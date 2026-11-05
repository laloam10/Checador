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
for f in ../migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f 01_grants_supabase.sql
for f in [1-9]*_*.sql; do "${PSQL[@]}" -f "$f"; done
echo "Todas las pruebas de base de datos pasaron."
