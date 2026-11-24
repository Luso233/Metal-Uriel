#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  METAL-URIEL v2.0 - ARRANQUE PLUG & PLAY (Linux / Ubuntu)"
echo "  Universidad Interamericana para el Desarrollo (UNID)"
echo "============================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js v20+ no está instalado. Consulta el README.md para instalarlo."
  exit 1
fi

echo "[OK] Node.js detectado: $(node -v)"

if [ ! -d "node_modules" ]; then
  echo "[1/3] Instalando dependencias..."
  npm install --omit=dev
else
  echo "[1/3] Dependencias node_modules listas."
fi

if [ ! -f ".env" ]; then
  echo "[2/3] Copiando plantilla virgen .env.example -> .env ..."
  cp .env.example .env
  chmod 600 .env
else
  echo "[2/3] Archivo .env detectado."
fi

mkdir -p logs

if command -v pm2 >/dev/null 2>&1 && [ "${1:-}" = "--pm2" ]; then
  echo "[3/3] Iniciando en modo servidor 24/7 con PM2..."
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 status
else
  echo "[3/3] Iniciando servidor Metal-Uriel en http://0.0.0.0:3000 ..."
  echo "      (Usa './iniciar-metal-uriel.sh --pm2' para dejarlo corriendo 24/7)"
  exec node index.js
fi
