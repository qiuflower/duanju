# ---- Stage 1: Build the frontend ----
FROM node:20-slim AS frontend-builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY index.html ./
COPY vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Build the server TypeScript ----
FROM node:20-slim AS server-builder
WORKDIR /app/server

COPY server/package*.json ./
RUN npm install

COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npx tsc

# ---- Stage 3: Production image ----
FROM node:20-slim
WORKDIR /app

# Install server production dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy compiled server from Stage 2
COPY --from=server-builder /app/server/dist ./server/dist

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Runtime environment
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server/dist/index.js"]
