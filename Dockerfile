# syntax=docker/dockerfile:1

# ─── Build stage ────────────────────────────────────────────────────────────
# BUILDPLATFORM = host (amd64) → npm ci & tsc run natively, NOT under QEMU.
# Output is pure JS so it works on any target platform.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer cache)
COPY package*.json ./

# npm cache mount → skips re-downloading packages on subsequent builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source code
COPY . .

# Build: tsc → dist/, esbuild → index.js bundle
RUN npm run rebuild

# ─── Production stage ────────────────────────────────────────────────────────
# TARGETPLATFORM = arm64 or amd64 — Docker pulls the right node image natively.
# No QEMU emulation here either — just copying files into the right base image.
FROM node:20-alpine AS production

LABEL org.opencontainers.image.title="serper-search-mcp" \
      org.opencontainers.image.description="Serper Search MCP Server — Universal Search Gateway for AI Agents" \
      org.opencontainers.image.source="https://github.com/smjahid012/serper-search-mcp-server" \
      org.opencontainers.image.url="https://github.com/smjahid012/serper-search-mcp-server" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="SMLabs AI"

# Install system deps
RUN apk add --no-cache curl dumb-init

WORKDIR /app

# Install only production deps (with npm cache mount)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S serperuser && \
    adduser -S serperuser -u 1001 -G serperuser

# Copy built artifacts from builder (pure JS — works on all platforms)
COPY --from=builder --chown=serperuser:serperuser /app/dist ./dist/
COPY --from=builder --chown=serperuser:serperuser /app/index.js ./

USER serperuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health 2>/dev/null || \
      pgrep -f "node.*index.js" > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]
