#!/usr/bin/env bash
# Starts/stops a private PostgreSQL cluster for local development in ./.dev/pgdata
# (port 5434, user "svss"). Not used in production.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA=.dev/pgdata
case "${1:-start}" in
  init)
    mkdir -p .dev
    "$PGBIN/initdb" -D "$DATA" -U svss --auth=trust -E UTF8
    "$0" start
    for db in svss svss_test svss_e2e; do psql -h 127.0.0.1 -p 5434 -U svss -d postgres -c "CREATE DATABASE $db" || true; done
    ;;
  start) "$PGBIN/pg_ctl" -D "$DATA" -o "-p 5434 -c listen_addresses=127.0.0.1 -k /tmp" -l .dev/postgres.log start ;;
  stop) "$PGBIN/pg_ctl" -D "$DATA" stop ;;
  status) "$PGBIN/pg_ctl" -D "$DATA" status ;;
  *) echo "usage: $0 init|start|stop|status"; exit 1 ;;
esac
