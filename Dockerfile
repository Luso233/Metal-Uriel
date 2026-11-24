# =========================================================================
# Stage 1: Compilación del Frontend Offline (Vite + React 18 + Tailwind CSS)
# =========================================================================
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY vite.config.mjs tailwind.config.cjs postcss.config.cjs ./
COPY client ./client
RUN npm run build

# =========================================================================
# Stage 2: Imagen Final de Producción (Ligera, Modular y 100% Offline LAN)
# =========================================================================
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js schema.sql brochures.json system_prompt.txt .env.example ./
COPY lib ./lib
COPY src ./src
COPY public/uploads ./public/uploads
COPY --from=builder /app/public/dist ./public/dist

RUN mkdir -p /app/logs /app/public/uploads/recursos && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "index.js"]
