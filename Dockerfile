# Stage 1: Build frontend
FROM oven/bun:1-slim AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code and build
COPY . .
RUN bun run build

# Stage 2: Production runtime
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV AGENT_HOME_DIR=/app/agent-home
ENV SERVE_STATIC=true

# Copy runtime manifests and production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built frontend assets and backend server
COPY --from=builder /app/dist ./dist
COPY server ./server

# Create data and agent-home directories and assign non-root ownership
RUN mkdir -p /app/data /app/agent-home && chown -R bun:bun /app

USER bun

EXPOSE 3000

CMD ["bun", "server/index.ts"]
