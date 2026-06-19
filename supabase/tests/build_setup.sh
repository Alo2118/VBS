#!/usr/bin/env bash
# Rigenera supabase/setup_all.sql concatenando le migrazioni + seed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/supabase/setup_all.sql"
{
  echo "-- VBS — Setup completo del database (generato da migrations/*.sql + seed.sql)."
  echo "-- Incolla questo file nello SQL Editor di Supabase (Run) per creare tutto in una volta."
  echo "-- Rigenera con: bash supabase/tests/build_setup.sh"
  echo
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "-- ============================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================"
    cat "$f"; echo
  done
  echo "-- ============================================================"
  echo "-- seed.sql"
  echo "-- ============================================================"
  cat "$ROOT/supabase/seed.sql"
} > "$OUT"
echo "Scritto $OUT"
