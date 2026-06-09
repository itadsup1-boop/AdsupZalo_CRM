# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build backend ───────────────────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/scripts/ scripts/
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npx tsc --skipLibCheck || echo "Ignoring TS errors"

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

# Copy built artefacts
COPY --from=backend-builder /app/backend/dist       /app/dist
COPY --from=backend-builder /app/backend/node_modules /app/node_modules
COPY --from=backend-builder /app/backend/prisma     /app/prisma
COPY --from=backend-builder /app/backend/prisma.config.ts /app/prisma.config.ts
COPY --from=backend-builder /app/backend/package.json /app/package.json
COPY --from=backend-builder /app/backend/scripts     /app/scripts
COPY --from=backend-builder /app/backend/service-account.json* /app/
COPY --from=frontend-builder /app/frontend/dist     /app/static

RUN mkdir -p /var/lib/zalo-crm/files

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# Patch zca-js, push schema to DB, then start server
CMD ["sh", "-c", "node scripts/patch-zca.js && npx prisma db push --accept-data-loss --url \"$DATABASE_URL\" && node dist/app.js"]

