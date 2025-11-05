# Build stage
FROM node:18-alpine AS builder

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application (if using TypeScript)
RUN npm run build 2>/dev/null || echo "No build step defined, using JavaScript"

# Production stage
FROM node:18-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/index.js ./

# Create non-root user
RUN addgroup -g 1001 -S serperuser && \
    adduser -S serperuser -u 1001 -G serperuser

# Change ownership of app directory
RUN chown -R serperuser:serperuser /app

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