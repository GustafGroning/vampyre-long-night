#!/usr/bin/env bash
# Testar migrationerna mot en tillfällig lokal Postgres (kräver initdb/pg_ctl i PATH
# eller PG_BIN). Kör: bash supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
tmp="$(mktemp -d)"
trap '"$PG_BIN/pg_ctl" -D "$tmp/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
"$PG_BIN/initdb" -D "$tmp/data" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$tmp/data" -o "-k $tmp -p 55432 -c listen_addresses=''" -l "$tmp/log" start >/dev/null
psql=(psql -h "$tmp" -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${psql[@]}" -f "$here/supabase_stub.sql"
for f in "$here"/../migrations/*.sql; do "${psql[@]}" -f "$f"; done
"${psql[@]}" -f "$here/game_server.test.sql"
