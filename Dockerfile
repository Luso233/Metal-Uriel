# Imagen de producción ligera para Metal-Uriel (UNID Admisiones)
FROM node:20-alpine

WORKDIR /app

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código fuente y recursos estáticos (incluye PDFs institucionales en public/uploads/recursos)
COPY index.js schema.sql brochures.json system_prompt.txt .env.example ./
COPY lib ./lib
COPY public ./public

# Crear carpeta de logs y asegurar permisos de usuario no-root
RUN mkdir -p /app/logs /app/public/uploads/recursos && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "index.js"]
