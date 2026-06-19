FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public build-time configuration. NEXT_PUBLIC_* values are inlined into the
# client bundle during `next build`, so they must be provided as build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_DIAGNOSTICS_URL
ARG NEXT_PUBLIC_BLUEPRINT_URL
ARG NEXT_PUBLIC_WORKFLOWS_URL
ARG NEXT_PUBLIC_PAYMENTS_URL
ARG NEXT_PUBLIC_ROADMAP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_DIAGNOSTICS_URL=$NEXT_PUBLIC_DIAGNOSTICS_URL \
    NEXT_PUBLIC_BLUEPRINT_URL=$NEXT_PUBLIC_BLUEPRINT_URL \
    NEXT_PUBLIC_WORKFLOWS_URL=$NEXT_PUBLIC_WORKFLOWS_URL \
    NEXT_PUBLIC_PAYMENTS_URL=$NEXT_PUBLIC_PAYMENTS_URL \
    NEXT_PUBLIC_ROADMAP_URL=$NEXT_PUBLIC_ROADMAP_URL

ENV NEXT_TELEMETRY_DISABLED=1
# Force Node to prefer IPv4 — Next.js font loader (undici) defaults to IPv6,
# which is not routable in the Docker build network and causes font fetch to fail.
ENV NODE_OPTIONS=--dns-result-order=ipv4first

ENV TURBOPACK=0
ENV TURBOPACK=0
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 9001

ENV PORT=9001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
