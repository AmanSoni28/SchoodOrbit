#!/usr/bin/env bash
# Vercel build: Prisma client → (production only) database migrations → optional one-off demo seed → frontend.
set -euo pipefail
SCHEMA=backend/prisma/schema.prisma

npx prisma generate --schema "$SCHEMA"

if [ "${VERCEL_ENV:-}" = "production" ]; then
  # Migrations need a direct connection: the pooled URL (PgBouncer) can't hold migration locks.
  DIRECT="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"
  DATABASE_URL="$DIRECT" npx prisma migrate deploy --schema "$SCHEMA"

  # Demo data only when asked for explicitly: `vercel deploy --prod --build-env SEED_DEMO=1 --build-env SEED_PASSWORD=...`.
  # Every seed script is idempotent. Runs in a subshell so NODE_ENV never leaks into the frontend build.
  if [ "${SEED_DEMO:-}" = "1" ]; then
    (
      export DATABASE_URL="$DIRECT" NODE_ENV=development
      for s in db:seed db:demo db:topics db:activity; do npm run -s "$s" -w backend 2>&1 | sed '/password/Id'; done
    )
  fi
fi

VITE_MAX_UPLOAD_MB=4 npm run build -w frontend
