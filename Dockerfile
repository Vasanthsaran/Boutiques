# ───────────────────────────────────────────────────────────────
#  SVSS Boutique — production image
#
#  Two stages:
#    1) "build"   installs everything and compiles backend + frontend
#    2) "runtime" keeps only what is needed to run, so the final
#                 image stays small and has no build tools in it
# ───────────────────────────────────────────────────────────────

# ───────── Stage 1: build ─────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma needs OpenSSL to generate its client.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy ONLY the package files first. Docker caches this layer, so
# "npm ci" is skipped on rebuilds unless dependencies actually changed.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

# Now the source code, then compile:
#   backend  -> prisma generate + tsc  -> backend/dist
#   frontend -> tsc + vite build       -> frontend/dist
COPY backend backend
COPY frontend frontend
RUN npm run build

# ───────── Stage 2: runtime ─────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Production dependencies only (no vite, typescript, playwright, ...).
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev \
 && npm install -g prisma@6.19.3 --no-fund --no-audit \
 && npm cache clean --force

# The generated Prisma client, the compiled server and the built website.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist

# Database schema + migrations (needed by "prisma migrate deploy").
COPY backend/prisma ./backend/prisma

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/backend/storage \
 && chown -R node:node /app

# Don't run as root inside the container.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/dist/src/index.js"]
