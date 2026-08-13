# Imagem de desenvolvimento da API (o alvo do MVP e o ambiente local; nao ha
# hardening de producao aqui). O contexto de build e a raiz do monorepo, porque
# a API depende do workspace @univc/shared.
FROM node:22-slim

# O Prisma precisa do OpenSSL para carregar o query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests primeiro: enquanto as dependencias nao mudam, esta camada e cacheada.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/

# --ignore-scripts pula o `prepare` do @univc/shared, que roda logo abaixo com
# o codigo-fonte ja copiado.
RUN npm ci --ignore-scripts

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @univc/shared

WORKDIR /app/apps/api

# `prisma generate` exige a variavel presente para validar o schema, mas nao
# abre conexao: no boot o entrypoint usa a DATABASE_URL real do compose.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

RUN npm run build

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3333

ENTRYPOINT ["docker-entrypoint.sh"]
