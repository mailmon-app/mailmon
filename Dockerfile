# syntax=docker/dockerfile:1

# Base stage for shared configuration
FROM node:22-alpine AS base
ARG PNPM_VERSION=10.32.1
ARG TURBO_VERSION=2.9.6
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN pnpm add -g turbo@${TURBO_VERSION}

# Prune stage to extract only necessary workspace files
FROM base AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .
ARG APP_NAME
RUN turbo prune ${APP_NAME} --docker
# Ensure root config files are included in the pruned output
COPY tsconfig*.json .oxfmtrc.json .oxlintrc.json out/full/

# Builder stage to install dependencies and build the application
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy pruned workspace files (json + full source)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/full/ .

# Install dependencies - allowing lockfile updates during reconciliation with full source
RUN pnpm install --no-frozen-lockfile

# Build the application
ARG APP_NAME
RUN turbo build --filter=${APP_NAME}

# Final runner stage for a secure, minimal production image
FROM node:22-alpine AS runner
WORKDIR /app

# Re-enable corepack
ARG PNPM_VERSION=10.32.1
ARG TURBO_VERSION=2.9.6
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN pnpm add -g turbo@${TURBO_VERSION}

# Set production environment
ENV NODE_ENV=production
# Match GCP Cloud Run default port
ENV PORT=8080
EXPOSE 8080

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy the workspace root configuration and built packages/apps
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps

# Install only production dependencies
# Use --ignore-scripts to avoid failing on dev-only prepare scripts
RUN pnpm install --prod --no-frozen-lockfile --ignore-scripts

# Create .turbo directory to prevent permission errors
RUN mkdir -p /app/.turbo && chown -R nodejs:nodejs /app/.turbo

USER nodejs

# Use the app name to start the specific filtered app from the workspace root
ARG APP_NAME
ENV APP_NAME=${APP_NAME}
CMD ["sh", "-c", "exec pnpm --filter=${APP_NAME} start"]
