# Base stage
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY apps/web/prisma ./apps/web/prisma/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile || pnpm install

# Builder stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

# Generate Prisma client for worker (uses web's schema)
WORKDIR /app/apps/web
RUN pnpm db:generate

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build worker
WORKDIR /app/apps/worker
RUN pnpm build

# Runner stage for production
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

WORKDIR /app

COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/web/node_modules/.prisma ./apps/web/node_modules/.prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

USER worker

CMD ["node", "apps/worker/dist/index.js"]

# Development stage
FROM base AS development
ENV NODE_ENV=development

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY apps/web/prisma ./apps/web/prisma/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install

COPY . .

# Generate Prisma client
WORKDIR /app/apps/web
RUN pnpm db:generate

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/apps/worker

CMD ["pnpm", "dev"]
