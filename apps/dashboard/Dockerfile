# Imagem de producao do dashboard: builda o pacote compartilhado e o Vite,
# depois serve so o resultado (estatico) por um Caddy minimo, sem TLS -- o
# Caddy publico do host e quem termina HTTPS e faz reverse proxy ate aqui.
# O contexto de build e a raiz do monorepo, porque o dashboard depende do
# workspace @univc/shared.
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --ignore-scripts

COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard
RUN npm run build -w @univc/shared

# VITE_API_URL entra no bundle em tempo de build (variaveis Vite sao
# compiladas, nao lidas em runtime) -- por isso e um build arg, nao um env
# var do container final.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @univc/dashboard

FROM caddy:2-alpine
COPY --from=build /app/apps/dashboard/dist /srv
COPY apps/dashboard/Caddyfile.static /etc/caddy/Caddyfile
