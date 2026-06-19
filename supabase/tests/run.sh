#!/usr/bin/env bash
# Verifica le migrazioni e le regole di business contro un Postgres reale,
# usando un'istanza temporanea locale (nessun Docker, nessun Supabase cloud).
# Stub minimale dello schema `auth` di Supabase in 00_bootstrap_auth.sql.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
PORT=55432

# initdb/postgres non possono girare come root: usa l'utente di sistema postgres
# quando lo script è lanciato da root. La directory dati va in un percorso
# accessibile a postgres (non in TMPDIR, che può essere ad accesso riservato).
RUN=()
TMPBASE=/tmp
if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); TMPBASE=/var/lib/postgresql; fi

BASE="$(mktemp -d -p "$TMPBASE" vbs-pgtest.XXXXXX)"
DATADIR="$BASE/pgdata"
SOCK="$BASE/sock"
mkdir -p "$SOCK"
if [ "${#RUN[@]}" -gt 0 ]; then chown -R postgres:postgres "$BASE"; fi

cleanup() {
  "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DATADIR" -m immediate stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> initdb"
"${RUN[@]}" "$PGBIN/initdb" -D "$DATADIR" -U postgres --auth=trust >/dev/null

echo "==> start postgres (porta $PORT)"
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DATADIR" \
  -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null

psql_run() { "${RUN[@]}" psql -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d postgres "$@"; }

echo "==> bootstrap auth (stub Supabase)"
psql_run -q -f "$TESTS/00_bootstrap_auth.sql"

echo "==> migrazioni"
for f in "$MIG"/*.sql; do
  echo "    - $(basename "$f")"
  psql_run -q -f "$f"
done

echo "==> seed"
psql_run -q -f "$ROOT/supabase/seed.sql"

echo "==> scenari di business"
psql_run -f "$TESTS/10_scenarios.sql"

echo "==> OK"
