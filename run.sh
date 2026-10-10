#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  SVSS Boutique — one-command launcher
#
#    ./run.sh          start in development mode (default)
#    ./run.sh prod     build and run the production server locally
#    ./run.sh stop     stop the app servers and the local database
#    ./run.sh test     run API tests + end-to-end tests
#
#  First run: installs packages, creates .env, sets up a private
#  PostgreSQL in ./.dev (port 5434), applies migrations, seeds safe
#  defaults, and asks you to create the admin account.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

c_rose=$'\e[38;5;175m'; c_gold=$'\e[38;5;179m'; c_red=$'\e[31m'; c_off=$'\e[0m'
say()  { echo "${c_rose}▸${c_off} $*"; }
ok()   { echo "${c_gold}✓${c_off} $*"; }
die()  { echo "${c_red}✗ $*${c_off}" >&2; exit 1; }

MODE="${1:-dev}"
API_PORT=4000
WEB_PORT=5173
DB_PORT=5434

port_pid() { ss -ltnp 2>/dev/null | grep -E ":$1\b" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true; }

stop_port() {
  local pid; pid="$(port_pid "$1")"
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null && ok "Stopped process on port $1"; fi
}

# ───────── stop ─────────
if [[ "$MODE" == "stop" ]]; then
  stop_port "$API_PORT"; stop_port "$WEB_PORT"
  if [[ -d .dev/pgdata ]]; then bash scripts/dev-db.sh stop || true; fi
  exit 0
fi

# ───────── prerequisites ─────────
command -v node >/dev/null || die "Node.js is not installed (need v20+). https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 20 )) || die "Node.js v20+ required (found $(node -v))."
command -v npm >/dev/null || die "npm is not installed."

if [[ ! -d node_modules || ! -d node_modules/@prisma/client ]]; then
  say "Installing packages (first run, takes a minute)…"
  npm install
fi

# ───────── .env ─────────
if [[ ! -f .env ]]; then
  say "Creating .env for local development"
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat > .env <<EOF
NODE_ENV=development
PORT=$API_PORT
APP_ORIGIN=http://localhost:$WEB_PORT
DATABASE_URL=postgresql://svss@127.0.0.1:$DB_PORT/svss?schema=public
SESSION_SECRET=$SECRET
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=./storage
EOF
  ok ".env created"
fi

# The API port is whatever .env says (default 4000).
API_PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]"' || true)"
API_PORT="${API_PORT:-4000}"

# ───────── database ─────────
uses_local_db() { grep -qE "^DATABASE_URL=.*127\.0\.0\.1:$DB_PORT/" .env; }

if uses_local_db; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [[ -n "$PGBIN" ]] || die "PostgreSQL server binaries not found. Install PostgreSQL (e.g. sudo apt install postgresql) or set DATABASE_URL in .env to an existing database."
  if [[ ! -d .dev/pgdata ]]; then
    say "Setting up a private PostgreSQL database in ./.dev (port $DB_PORT)…"
    bash scripts/dev-db.sh init
  elif ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$DB_PORT" -q; then
    say "Starting local PostgreSQL…"
    bash scripts/dev-db.sh start >/dev/null
  fi
  for _ in {1..20}; do "$PGBIN/pg_isready" -h 127.0.0.1 -p "$DB_PORT" -q && break; sleep 0.5; done
  "$PGBIN/pg_isready" -h 127.0.0.1 -p "$DB_PORT" -q || die "PostgreSQL did not start — see .dev/postgres.log"
  ok "Database running on port $DB_PORT"
else
  say "Using DATABASE_URL from .env"
fi

say "Applying database migrations…"
npm run db:deploy --silent >/dev/null
npm run db:seed --silent >/dev/null
ok "Database ready"

# ───────── first admin ─────────
ADMIN_COUNT="$(cd backend && node --env-file=../.env -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.count({ where: { role: 'ADMIN' } }).then(n => { console.log(n); return p.\$disconnect(); });
" 2>/dev/null || echo 0)"

if [[ "$ADMIN_COUNT" == "0" ]]; then
  echo
  say "No admin account yet — let's create one."
  read -rp "  Admin name:  " A_NAME
  read -rp "  Admin email: " A_EMAIL
  while true; do
    read -rsp "  Password (6+ characters; use 12+ before going live): " A_PASS; echo
    read -rsp "  Repeat password: " A_PASS2; echo
    [[ "$A_PASS" == "$A_PASS2" ]] || { echo "  Passwords don't match."; continue; }
    (( ${#A_PASS} >= 6 )) || { echo "  Too short."; continue; }
    break
  done
  ADMIN_NAME="$A_NAME" ADMIN_EMAIL="$A_EMAIL" ADMIN_PASSWORD="$A_PASS" npm run create-admin --silent
  unset A_PASS A_PASS2
fi

# ───────── test ─────────
if [[ "$MODE" == "test" ]]; then
  [[ -f .env.test ]] || die ".env.test is missing (see README → Commands)."
  npm test
  [[ -f .env.e2e ]] && npm run test:e2e || say "Skipping e2e (.env.e2e missing)"
  exit 0
fi

# ───────── ports free? ─────────
for p in "$API_PORT" $([[ "$MODE" == "dev" ]] && echo "$WEB_PORT"); do
  if [[ -n "$(port_pid "$p")" ]]; then
    die "Port $p is already in use (the site may already be running). Run ./run.sh stop first."
  fi
done

cleanup() {
  echo
  say "Shutting down…"
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  ok "Stopped. (Database keeps running; ./run.sh stop to stop it too.)"
}
trap cleanup INT TERM

# ───────── prod ─────────
if [[ "$MODE" == "prod" ]]; then
  say "Building…"
  npm run build
  if grep -qE '^NODE_ENV=production' .env; then
    npm start & API_PID=$!
  else
    # Local preview of the production build (keeps dev storage settings).
    (cd backend && APP_ORIGIN="http://localhost:$API_PORT" node --env-file-if-exists=../.env dist/src/index.js) & API_PID=$!
  fi
  sleep 2
  echo
  ok "SVSS Boutique (production build) → http://localhost:$API_PORT"
  ok "Admin → http://localhost:$API_PORT/admin/login"
  echo "  Press Ctrl+C to stop."
  wait
  exit 0
fi

# ───────── dev ─────────
[[ "$MODE" == "dev" ]] || die "Unknown option '$MODE'. Use: dev | prod | stop | test"

npm run dev:backend & API_PID=$!
npm run dev:frontend & WEB_PID=$!

for _ in {1..30}; do curl -sf "http://localhost:$API_PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
echo
ok "Website → http://localhost:$WEB_PORT"
ok "Admin   → http://localhost:$WEB_PORT/admin/login"
echo "  Press Ctrl+C to stop."
wait
