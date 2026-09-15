# ── Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json backend/
RUN npm ci --workspace backend --include-workspace-root=false || npm install --workspace backend

COPY backend/ backend/
RUN cd backend && npx prisma generate && npm run build

# ── Runtime stage ──────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app/backend
ENV NODE_ENV=production

# argon2 needs prebuilt binaries; use the Alpine-compatible package
RUN apk add --no-cache libc6-compat openssl

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/node_modules /app/backend/node_modules
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/backend/prisma /app/backend/prisma
COPY --from=build /app/backend/package.json /app/backend/package.json

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3001/api/v1/health/ready || exit 1

# Run migrations then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
