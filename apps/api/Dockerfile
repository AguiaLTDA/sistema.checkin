# Imagem da API. O contexto de build e a raiz do monorepo, porque a API
# depende do workspace @univc/shared. Os dados ficam na planilha do Google
# (Apps Script), entao a imagem nao precisa de cliente de banco nem de OpenSSL.
FROM node:22-slim

WORKDIR /app

# Manifests primeiro: enquanto as dependencias nao mudam, esta camada e cacheada.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
# Codigo-fonte do shared copiado ANTES do `npm ci`, e nao so o package.json:
# `--ignore-scripts` nao impede de forma confiavel o `prepare` (que builda o
# shared) de rodar durante o install dos workspaces, e sem o tsconfig.json
# presente nesse momento o build falharia com TS5058.
COPY packages/shared packages/shared

RUN npm ci --ignore-scripts

COPY apps/api apps/api

RUN npm run build -w @univc/shared

WORKDIR /app/apps/api

RUN npm run build

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3333

ENTRYPOINT ["docker-entrypoint.sh"]
