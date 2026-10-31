# PolyDocks single-container sandbox image (local demo = 1 sandbox per account).
# One image, one process: Bun serves the API and the built frontend.
# ALL runtime state lives in two mounted paths and nothing else:
#   /app/data        SQLite (polymax.db + WAL) via DATA_DIR
#   /app/agent-home  memory, sessions, artifacts, agent files via AGENT_HOME_DIR
# The repo `workspace/` tree is a one-time import seed only (never live state).

# Stage 1: Build frontend
FROM oven/bun:1.4.3-slim AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code and build
COPY . .
RUN bun run build

# Stage 2: Production runtime
FROM oven/bun:1.4.3-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV AGENT_HOME_DIR=/app/agent-home
ENV DEPLOY_MODE=local
ENV SERVE_STATIC=true

# Copy runtime manifests and production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built frontend assets, backend server, and shared sources.
# server/ imports type/module siblings under src/ at runtime
# (e.g. world map bundles), so src/ must ship too — data/ stays a volume.
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY src ./src

# Create data and agent-home directories and assign non-root ownership.
# Fresh named volumes inherit this ownership on first mount, so the
# unprivileged user can write; bind mounts keep host ownership instead.
RUN mkdir -p /app/data /app/agent-home && chown -R bun:bun /app
VOLUME ["/app/data", "/app/agent-home"]

USER bun

EXPOSE 3000

# Binds loopback inside the container; publish on the host as 127.0.0.1 only.
CMD ["bun", "server/index.ts"]
