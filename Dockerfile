# Use official Node.js image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install root dependencies
RUN npm install

# Copy server package files
COPY server/package*.json ./server/

# Install server dependencies
RUN cd server && npm install

# Copy the rest of the application code
# Note: Ensure .env is present in the directory and NOT in .dockerignore
# if you want environment variables to be baked into the frontend build.
COPY . .

# Build the frontend
RUN npm run build

# Environment variables for runtime
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "server/index.js"]
