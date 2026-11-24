#!/bin/sh
set -e

cd /app/apps/api

if [ "$RUN_SEED_ON_BOOT" = "true" ]; then
  echo "> rodando seed de desenvolvimento..."
  # O seed e idempotente e se recusa a gravar na planilha real; se falhar, a
  # API sobe assim mesmo.
  npm run db:seed || echo "! seed nao rodou, seguindo com a API mesmo assim"
fi

echo "> iniciando a API..."
exec node dist/index.js
