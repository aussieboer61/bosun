# Stage 1: Build the React frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine AS production

# Install native build dependencies for node-pty
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

# Copy backend package.json and install production deps
COPY backend/package.json ./
RUN npm install --omit=dev

# Rebuild native modules (node-pty)
RUN npm rebuild node-pty

# Copy backend source
COPY backend/ ./

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Add node user to docker group (GID 988 matches host docker group)
# and create non-root user directories
RUN addgroup -g 988 docker 2>/dev/null || true && \
    addgroup node docker && \
    mkdir -p /home/bosun && \
    chown -R node:node /home/bosun /app

USER node

EXPOSE 4080

CMD ["node", "index.js"]
