#!/usr/bin/env bash
# Aplica as migrations num Postgres local (com um stub do Supabase) e roda tests/db/*.sql.
# Uso: npm run test:db   (variáveis: PGHOST, PGPORT, PGUSER, PGPASSWORD; banco temporário criado e removido)
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB_NAME:-albuns_test_$$}"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

if [ -z "${PGHOST:-}" ] && [ "$(id -u)" = "0" ] && command -v runuser >/dev/null; then
  # Ambiente de desenvolvimento local: usa o usuário postgres via socket.
  PSQL=(runuser -u postgres -- env PGOPTIONS="$PGOPTIONS" psql -v ON_ERROR_STOP=1 -q -X)
fi

cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" < scripts/test-db/supabase-stub.sql

for f in supabase/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  "${PSQL[@]}" -d "$DB" < "$f"
done

status=0
for t in tests/db/*.sql; do
  if "${PSQL[@]}" -o /dev/null -d "$DB" < "$t"; then
    echo "ok   $(basename "$t")"
  else
    echo "FAIL $(basename "$t")"
    status=1
  fi
done
exit $status
