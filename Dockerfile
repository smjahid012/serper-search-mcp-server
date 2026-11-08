# Build stage
FROM node:20-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application: tsc -> dist/, then esbuild -> index.js bundle
RUN npm run rebuild

# Production stage
FROM node:20-alpine AS production

LABEL org.opencontainers.image.title="serper-search-mcp" \
      org.opencontainers.image.description="Serper Search MCP Server — Universal Search Gateway for AI Agents" \
      org.opencontainers.image.source="https://github.com/smjahid012/serper-search-mcp-server" \
      org.opencontainers.image.url="https://github.com/smjahid012/serper-search-mcp-server" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="SMLabs AI"

# Install curl for health checks
RUN apk add --no-cache curl dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S serperuser && \
    adduser -S serperuser -u 1001 -G serperuser

# Copy built application from builder stage
COPY --from=builder --chown=serperuser:serperuser /app/dist ./dist/
COPY --from=builder --chown=serperuser:serperuser /app/index.js ./

# Switch to non-root user
USER serperuser

# Expose port for HTTP transport
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health 2>/dev/null || \
      # Fallback to checking if process is running
      pgrep -f "node.*index.js" > /dev/null || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the server
CMD ["node", "index.js"]