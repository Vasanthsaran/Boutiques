#!/bin/sh
# Runs every time the container starts, before the web server.
set -e

# Apply any pending database migrations (safe to run repeatedly).
# Set RUN_MIGRATIONS=0 to skip, e.g. if you run migrations as a separate job.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "[entrypoint] Applying database migrations..."
  prisma migrate deploy --schema backend/prisma/schema.prisma
fi

# Hand over to the real command (the Node server). "exec" makes Node
# process 1, so it receives Docker's stop signal and shuts down cleanly.
exec "$@"
