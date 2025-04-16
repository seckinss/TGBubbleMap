FROM node:20-slim AS js-builder

WORKDIR /app

# Install dependencies for Node.js application
COPY package*.json ./
RUN npm install

# Copy source code
COPY tsconfig.json ./
COPY index.ts ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Final image
FROM python:3.11-slim

WORKDIR /app

# Accept Debian frontend to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive


RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    fonts-liberation \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY telegram-bot/requirements.txt /app/telegram-bot/
RUN pip install --no-cache-dir -r /app/telegram-bot/requirements.txt

# Copy Node.js application
COPY --from=js-builder /app/dist /app/dist
COPY --from=js-builder /app/node_modules /app/node_modules
COPY package.json /app/

# Copy Python application
COPY telegram-bot/ /app/telegram-bot/

# Copy the rest of the files needed for both applications
COPY .env.example /app/.env.example

# Copy start script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"] 