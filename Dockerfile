# ---- Stage 1: Build the frontend ----
FROM node:20-slim AS builder
WORKDIR /app

# Copy root package files for devDependencies (Vite, React, etc.)
COPY package*.json ./
RUN npm install

# Copy source code and config needed for build
COPY index.html ./
COPY vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Production image ----
FROM node:20-slim
WORKDIR /app

# Copy server package files and install only production dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# Runtime environment
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server/index.js"]
