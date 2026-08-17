FROM node:20-slim

# Chromium + fonts/libs needed by whatsapp-web.js's headless browser session.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation libnss3 libatk-bridge2.0-0 libgtk-3-0 \
    libgbm1 libasound2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

# Railway sets PORT; the app reads it in index.js.
CMD ["node", "index.js"]
