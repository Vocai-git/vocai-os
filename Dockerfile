# VOCAI OS — imagen para Railway.
# Incluye Chromium para que config/placa.js pueda renderizar las placas.
FROM node:22-slim

# Chromium + fuentes y certificados que necesita el render headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (capa cacheable).
COPY package*.json ./
RUN npm install

# Código.
COPY . .

# Ruta fija de Chromium — la usa buscarChrome() en config/placa.js.
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "server.js"]
