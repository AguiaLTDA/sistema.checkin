#!/bin/sh
set -e

cd /app/apps/api

if [ "$RUN_MIGRATIONS_ON_BOOT" = "true" ]; then
  echo "> aplicando migrations do Prisma..."
  npx prisma migrate deploy
fi

if [ "$RUN_SEED_ON_BOOT" = "true" ]; then
  echo "> rodando seed de desenvolvimento..."
  # O seed e idempotente; se falhar, a API sobe assim mesmo.
  npm run db:seed || echo "! seed falhou, seguindo com a API mesmo assim"
fi

echo "> iniciando a API..."
exec node dist/index.js
