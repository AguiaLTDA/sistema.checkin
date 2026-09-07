<p align="center">
  <img src="branding/univc-horizontal.png" alt="UNIVC - Centro Universitário Vale do Cricaré" width="320">
</p>

# UNIVC Check-in

Controle de presença de professores do **Centro Universitário Vale do Cricaré (UNIVC)**.

O professor marca chegada e saída pelo celular. **A localização é o único
fator de validação**: o servidor calcula, por Haversine, a distância entre a
posição enviada e o campus mais próximo e compara com o raio permitido daquele
campus. Não há etapa de biometria em nenhum ponto do fluxo.

Registros fora do raio não são descartados: entram como `PENDENTE_APROVACAO` e
o RH decide, com justificativa obrigatória.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Subindo o ambiente](#subindo-o-ambiente)
- [Deploy no Render](#deploy-no-render)
- [Deploy na VPS](#deploy-na-vps)
- [Usuários de teste](#usuários-de-teste)
- [Rodando o app no Expo Go](#rodando-o-app-no-expo-go)
- [Testando o fluxo completo](#testando-o-fluxo-completo)
- [API](#api)
- [Regras de negócio](#regras-de-negócio)
- [LGPD e dados pessoais](#lgpd-e-dados-pessoais)
- [Testes](#testes)
- [Decisões de projeto](#decisões-de-projeto)
- [Fora do escopo do MVP](#fora-do-escopo-do-mvp)

---

## Arquitetura

Monorepo com npm workspaces:

```
sistema.checkin/
├── apps/
│   ├── api/            @univc/api            Fastify + Prisma + PostgreSQL
│   ├── dashboard/      @univc/dashboard      React + Vite + Tailwind (RH/coordenação)
│   ├── professor-web/  @univc/professor-web  React + Vite (professores, no navegador)
│   └── mobile/         app Expo (React Native) — professores, alternativa nativa
├── packages/
│   └── shared/       @univc/shared     enums, schemas zod e tipos da API
├── docker/           init do Postgres
└── docker-compose.yml
```

| Camada          | Stack                                                                 |
| --------------- | --------------------------------------------------------------------- |
| API             | Node 22, TypeScript, Fastify 5, Prisma 6, PostgreSQL 16, zod, JWT      |
| Dashboard       | React 19, Vite, Tailwind 4, React Router (RH/coordenação)              |
| App do professor | React 19, Vite, Tailwind 4 — roda no navegador, usa a Geolocation API do próprio aparelho |
| Mobile (Expo)   | Expo SDK 57, React Native 0.86, `expo-location` — alternativa nativa ao app web |
| Testes          | Vitest (unitários puros + integração contra Postgres real)            |

**Por que existem duas versões do app do professor.** Desde que a validação do
check-in passou a depender só da localização (sem biometria), o navegador
consegue fazer tudo que o fluxo precisa — pedir a posição com a
[Geolocation API](https://developer.mozilla.org/docs/Web/API/Geolocation_API)
e chamar a mesma API. `apps/professor-web` é essa versão: um link, sem
instalação, sem loja de aplicativos. `apps/mobile` continua existindo como
alternativa nativa (ícone na tela inicial, notificações no futuro, fila
offline já implementada) para quando isso for necessário — veja
[Rodando o app no Expo Go](#rodando-o-app-no-expo-go).

**`apps/mobile` fica fora dos workspaces de propósito.** O Metro (bundler do
React Native) não lida bem com dependências içadas por symlink para a raiz do
monorepo. O app tem o próprio `node_modules` e espelha os tipos da API em
`apps/mobile/src/tipos.ts` em vez de importar `@univc/shared` — ao mudar o
contrato da API, atualize os dois arquivos.

---

## Subindo o ambiente

### Pré-requisitos

- Docker + Docker Compose, **ou** Node 22+ e PostgreSQL 16 locais
- Node 22+ (para o dashboard e o app mobile, que rodam fora do Docker)

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Os valores padrão já funcionam em desenvolvimento. Vale ler os comentários do
arquivo — em especial `DATABASE_URL` (usada quando você roda a API **fora** do
Docker; dentro do compose o container monta a própria URL apontando para o
serviço `db`).

### 2. API + banco com Docker

```bash
docker compose up -d --build
```

Isso sobe:

- **`db`** — PostgreSQL 16 em `localhost:5432`, com o banco de testes
  `univc_checkin_test` criado junto;
- **`api`** — a API em `http://localhost:3333`, que no boot aplica as migrations
  (`prisma migrate deploy`) e roda o seed, porque `RUN_MIGRATIONS_ON_BOOT` e
  `RUN_SEED_ON_BOOT` estão como `true` no `docker-compose.yml`.

Conferindo:

```bash
curl localhost:3333/health
docker compose logs -f api
```

### 3. Sem Docker (Postgres local)

```bash
npm install                 # instala os workspaces e compila @univc/shared
createdb univc_checkin
createdb univc_checkin_test # usado pelos testes de integração
npm run db:migrate          # prisma migrate dev
npm run db:seed
npm run dev:api             # http://localhost:3333
```

### 4. Dashboard do RH

O dashboard não está no compose (roda direto pelo Vite):

```bash
npm run dev:dashboard       # http://localhost:5173
```

> A API só aceita as origens listadas em `CORS_ORIGINS` no `.env`. A porta 5173
> já está liberada; se mudar a porta do Vite, acrescente a nova origem lá.

### 5. App do professor (web)

Também roda direto pelo Vite, fora do compose:

```bash
npm run dev:professor-web   # http://localhost:5174
```

> Mesma observação do dashboard: a porta 5174 precisa estar em `CORS_ORIGINS`.
> Pedir localização (`navigator.geolocation`) exige contexto seguro — `http://localhost`
> conta como seguro para isso, então funciona em dev sem HTTPS.

### Comandos úteis

| Comando                 | O que faz                                            |
| ----------------------- | ---------------------------------------------------- |
| `npm run db:migrate`    | cria/aplica migrations em desenvolvimento            |
| `npm run db:seed`       | popula campus, RH, professores e registros de exemplo |
| `npm run db:reset`      | derruba o banco, reaplica tudo e roda o seed         |
| `npm test`              | suíte completa da API                                |
| `npm run typecheck`     | typecheck de todos os workspaces                     |
| `npm run docker:logs`   | logs da API no compose                               |

---

## Deploy no Render

O banco continua sendo o Supabase (configurado à parte, direto no painel do
Supabase). O [`render.yaml`](render.yaml) na raiz descreve dois serviços:

| Serviço                    | Tipo        | O que serve                              |
| --------------------------- | ----------- | ----------------------------------------- |
| `univc-checkin-api`         | Web Service | API Fastify (`apps/api`)                  |
| `univc-checkin-dashboard`   | Static Site | Dashboard React buildado (`apps/dashboard`) |

### Passo a passo

1. No Render, **New +** → **Blueprint**, aponte para este repositório e
   selecione a branch (o blueprint já sugere `feat/checkin-somente-localizacao`).
2. O Render vai criar os dois serviços a partir do `render.yaml`, mas algumas
   variáveis ficam marcadas para preencher manualmente (`sync: false`) — o
   painel pede isso durante a criação:
   - **`univc-checkin-api`** → `DATABASE_URL`: connection string do **Session
     pooler** do Supabase (Project Settings → Database → Connection string;
     a conexão direta `db.<ref>.supabase.co` é IPv6-only e não funciona em
     boa parte dos ambientes). `CORS_ORIGINS` pode ficar em branco por
     enquanto — é ajustada no passo 4.
   - **`univc-checkin-dashboard`** → `VITE_API_URL`: também deixe em branco
     por enquanto.
3. Deploy inicial: a API sobe (rodando `prisma migrate deploy` como parte do
   build) e o dashboard builda, mas sem as URLs cruzadas o CORS ainda barra as
   chamadas. Anote as duas URLs que o Render atribuiu, do tipo
   `https://univc-checkin-api.onrender.com` e
   `https://univc-checkin-dashboard.onrender.com`.
4. Preencha as variáveis que faltaram e reimplante:
   - `univc-checkin-api` → `CORS_ORIGINS` = URL do dashboard.
   - `univc-checkin-dashboard` → `VITE_API_URL` = URL da API (variável só
     entra no build do Vite, então precisa de um novo deploy do site estático
     depois de mudar).
5. Confirme com `curl https://<url-da-api>.onrender.com/health` e abrindo o
   dashboard no navegador.

> **Plano gratuito do Render**: o Web Service "dorme" após um período sem
> tráfego e o primeiro request depois disso demora mais (cold start). Isso é
> esperado e não indica problema na API.

---

## Deploy na VPS

Alternativa ao Render: rodar a API, o dashboard e o app do professor em
containers Docker numa VPS própria, atrás de um Caddy que já esteja
publicando outros serviços na mesma máquina (é o caso da VPS de referência
deste projeto, que também roda o `agente-univc`). O banco continua sendo o
Supabase externo — este compose não sobe Postgres.

**Arquivos relevantes:**

| Arquivo                          | Papel                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| `docker-compose.prod.yml`         | Sobe `checkin-api`, `checkin-web` (dashboard) e `checkin-professor-web`, sem publicar portas no host — só ficam visíveis na rede Docker compartilhada |
| `apps/dashboard/Dockerfile`       | Builda o dashboard (Vite) e serve o resultado por um Caddy interno, sem TLS |
| `apps/professor-web/Dockerfile`   | Mesma ideia, para o app do professor |
| `.env.production.example`         | Variáveis necessárias (copiar para `.env.production` e preencher) |
| `deploy/vps/checkin.caddy`        | Blocos de site para o Caddy público existente encaminhar `checkin.*`, `professor.*` e `api.*` até os containers |

### Passo a passo

1. **Na VPS**, clone o repositório em um diretório próprio (não dentro do
   projeto que já está rodando):
   ```bash
   mkdir -p /opt/sistema-checkin && cd /opt/sistema-checkin
   git clone --branch feat/checkin-somente-localizacao \
     https://github.com/AguiaLTDA/sistema.checkin.git .
   ```
2. Configure as variáveis:
   ```bash
   cp .env.production.example .env.production
   # edite .env.production: DATABASE_URL (Supabase), JWT secrets
   # (openssl rand -hex 32), CORS_ORIGINS (uma origem por app, separadas por
   # vírgula: dashboard E app do professor) e VITE_API_URL com o domínio
   # público da API.
   ```
3. Suba os containers (a rede `agente-univc_runtime` precisa já existir —
   é criada pelo Caddy público compartilhado):
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml \
     up -d --build
   ```
4. **Publique os domínios** sem tocar no Caddyfile principal do Caddy
   compartilhado: copie o bloco de site pra pasta de import dele e recarregue
   a configuração (sem reiniciar o container, sem downtime pros outros
   serviços que ele já publica):
   ```bash
   cp deploy/vps/checkin.caddy /opt/agente-univc/publicador/conf.d/checkin.caddy
   docker exec univc-publicador caddy reload --config /etc/caddy/Caddyfile
   ```
5. Confira:
   ```bash
   curl https://api.<seu-host>/health
   ```
   e abra `https://checkin.<seu-host>` (RH) e `https://professor.<seu-host>`
   (professores) no navegador.

> **Domínio próprio depois**: o `deploy/vps/checkin.caddy` de referência usa
> um subdomínio [sslip.io](https://sslip.io) (`algo.<ip-com-tracos>.sslip.io`),
> que já resolve para o IP da VPS sem precisar configurar DNS — é o mesmo
> esquema usado pelos outros serviços dessa VPS. Para trocar por um domínio
> próprio, troque os três hostnames no arquivo, aponte os registros A do
> domínio pro IP da VPS, reaplique o passo 4 e atualize `CORS_ORIGINS` e
> `VITE_API_URL` no `.env.production` (o segundo exige reconstruir o
> `checkin-web` e o `checkin-professor-web`, já que o Vite embute a URL da
> API em tempo de build).

---

## Usuários de teste

Criados pelo seed (`apps/api/prisma/seed.ts`):

**Dashboard (RH/coordenação) — `http://localhost:5173`**

| Email         | Senha      |
| ------------- | ---------- |
| `rh@univc.br` | `admin123` |

**App mobile (professores) — senha `senha123` para todos**

| Email                       | Curso               |
| --------------------------- | ------------------- |
| `ana.rocha@univc.br`        | Direito             |
| `carlos.menezes@univc.br`   | Odontologia         |
| `mariana.prado@univc.br`    | Enfermagem          |
| `rafael.portela@univc.br`   | Medicina Veterinária |
| `juliana.lima@univc.br`     | Administração       |

**Campus cadastrado**

| Nome                        | Latitude    | Longitude   | Raio  |
| --------------------------- | ----------- | ----------- | ----- |
| Campus São Mateus - UNIVC   | `-18.70046` | `-39.86322` | 300 m |

> As coordenadas são **aproximadas**. Antes de usar em campo, ajuste no seed ou
> direto na tabela `campi` (`npx prisma studio -w @univc/api`). O modelo aceita
> vários campi, e a validação sempre usa o raio do campus mais próximo.

O seed também cria registros históricos: dois dias completos de uma professora,
um registro fora do raio pendente de aprovação e uma chegada sem saída — o
bastante para o dashboard e o relatório de jornada já terem o que mostrar.

---

## Rodando o app no Expo Go

```bash
cd apps/mobile
npm install
cp .env.example .env
```

Edite `apps/mobile/.env` e aponte para o **IP da sua máquina na rede local** —
`localhost`, no celular, é o próprio celular:

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:3333
```

Descubra o IP com `ip addr | grep "inet "` (Linux) ou `ipconfig getifaddr en0`
(macOS). Depois:

```bash
npm start          # ou, da raiz: npm run dev:mobile
```

Leia o QR code com o **Expo Go** (Android) ou com a câmera (iOS). O celular
precisa estar na mesma rede Wi-Fi do computador.

**Mockando a geolocalização.** Como o campus fica em São Mateus/ES, para testar
"dentro do raio" você vai querer simular a posição:

- **Simulador iOS**: `Features → Location → Custom Location`, latitude
  `-18.70046`, longitude `-39.86322`.
- **Emulador Android**: menu `...` → `Location` → mesma coordenada → `Set
  Location`.
- **Celular real**: use um app de mock location (Android, com opções de
  desenvolvedor) ou mude o campus do seed para as suas coordenadas atuais — o
  caminho mais simples.

Para testar o caminho "fora do raio", basta usar qualquer coordenada a mais de
300 m — o registro entra como pendente e aparece na aba de aprovações.

---

## Testando o fluxo completo

1. `docker compose up -d --build` e `npm run dev:dashboard`.
2. Abra o app no Expo Go e entre com `ana.rocha@univc.br` / `senha123`.
3. Toque em **Marcar chegada**. O app pede a permissão de localização, lê as
   coordenadas e envia o registro — não há confirmação biométrica.
4. A confirmação mostra o **horário devolvido pelo servidor** (não o relógio do
   celular) e a distância até o campus.
5. Toque em **Marcar saída** — o botão de chegada fica desabilitado até lá.
6. No dashboard (`rh@univc.br` / `admin123`), a aba **Registros** mostra os dois
   lançamentos; **Relatório de jornada** já calcula as horas do dia.

Para exercitar o modo offline: ative o modo avião antes de registrar. O app
guarda o ponto localmente com o aviso "pendente de sincronização" e envia
sozinho quando a conexão volta.

---

## API

Base: `http://localhost:3333`. Payloads em `snake_case`, validados com zod.

### Autenticação

| Método | Rota                | Descrição                                      |
| ------ | ------------------- | ---------------------------------------------- |
| `POST` | `/auth/login`       | login do professor → access + refresh token     |
| `POST` | `/auth/admin/login` | login do RH/coordenação                        |
| `POST` | `/auth/refresh`     | troca o refresh token (rotaciona e revoga o antigo) |
| `POST` | `/auth/logout`      | revoga o refresh token                         |
| `GET`  | `/auth/me`          | dados do professor autenticado                 |
| `PATCH` | `/auth/senha`      | professor troca a própria senha (exige a atual) |

Access token JWT de 15 min; refresh token de 7 dias, guardado no banco **apenas
como hash SHA-256** e rotacionado a cada uso.

#### Esqueci minha senha / primeiro acesso

Não existe fluxo de autoatendimento por e-mail — o reset é sempre iniciado
pelo RH:

1. RH chama `PATCH /admin/professores/:id/redefinir-senha` (dashboard → aba
   **Professores** → **Redefinir senha**). A API gera uma senha temporária
   legível e devolve em texto puro **uma única vez**, nessa resposta — nada
   disso é gravado, só o hash. O RH repassa ao professor por fora do sistema
   (telefone, presencial etc.).
2. O professor loga normalmente com a senha temporária. A resposta de login
   vem com `usuario.deve_trocar_senha: true`, e os três apps (dashboard não,
   só os do professor: mobile e web) bloqueiam o uso normal e mostram uma
   tela de troca obrigatória até isso resolver.
3. O professor chama `PATCH /auth/senha` informando a senha temporária como
   `senha_atual` e a nova como `senha_nova`. A partir daí `deve_trocar_senha`
   volta a `false` e ele usa a senha que escolheu.

Redefinir a senha também revoga todos os refresh tokens ativos daquele
professor — sessões antigas em outros aparelhos precisam logar de novo.

### Professor

| Método | Rota                  | Descrição                                       |
| ------ | --------------------- | ----------------------------------------------- |
| `POST` | `/checkin`            | registra chegada ou saída                       |
| `GET`  | `/checkin/historico`  | histórico paginado, filtrável por período/tipo/status |
| `GET`  | `/checkin/ultimo`     | último registro e próximo tipo esperado         |

```jsonc
// POST /checkin
{
  "tipo": "CHEGADA",              // CHEGADA | SAIDA
  "latitude": -18.70046,          // obrigatória
  "longitude": -39.86322,         // obrigatória
  "precisao_metros": 12.4,        // opcional
  "sincronizado_offline": false,  // opcional
  "registrado_offline_em": "..."  // obrigatório se sincronizado_offline
}
```

Não existe campo de horário: o `timestamp_servidor` é sempre `now()` no
backend. Não existe campo de biometria: chaves desconhecidas são descartadas
pelo zod, então um app antigo que ainda envie `metodo_biometrico` continua
funcionando — o campo é simplesmente ignorado.

### Admin (RH/coordenação)

| Método  | Rota                              | Descrição                                          |
| ------- | --------------------------------- | -------------------------------------------------- |
| `GET`   | `/admin/registros`                | todos os registros, filtros por curso/professor/status/tipo/período |
| `PATCH` | `/admin/registros/:id/aprovar`    | aprova um pendente (`justificativa_manual` obrigatória) |
| `PATCH` | `/admin/registros/:id/rejeitar`   | rejeita um pendente (idem)                          |
| `GET`   | `/admin/relatorio-jornada`        | pares chegada/saída, horas e inconsistências        |
| `GET`   | `/admin/professores`              | lista para os filtros do dashboard                  |
| `PATCH` | `/admin/professores/:id/redefinir-senha` | gera senha temporária e força troca no próximo login |
| `GET`   | `/admin/cursos`                   | cursos distintos                                    |
| `GET`   | `/admin/campi`                    | campi cadastrados                                   |

### Middlewares

- **Validação** — zod em todo corpo, query e parâmetro; erro 400 lista o
  problema campo a campo.
- **Rate limit** — `POST /checkin` limitado a 10 requisições/minuto
  (`CHECKIN_RATE_LIMIT_MAX`/`_WINDOW`). A chave combina IP e uma marca do token,
  para que o limite seja por professor e não pela rede inteira do campus, onde
  todo mundo compartilha o mesmo IP de saída.
- **Auditoria** — `logs_auditoria` grava **toda** tentativa de check-in,
  inclusive as rejeitadas e as que nem passam na validação, além de logins,
  refreshes e decisões manuais do RH.

---

## Regras de negócio

### Status do registro

| Situação                                   | Status                 |
| ------------------------------------------ | ---------------------- |
| Dentro do raio do campus mais próximo      | `VALIDADO`             |
| Fora do raio do campus mais próximo        | `PENDENTE_APROVACAO`   |
| Nenhum campus cadastrado                   | `PENDENTE_APROVACAO`   |
| Registro vindo da fila offline             | `PENDENTE_APROVACAO`   |
| Decisão manual do RH                       | `VALIDADO`/`REJEITADO` |

Sem coordenada não há registro: `latitude` e `longitude` são obrigatórias no
schema, e o app bloqueia o envio quando a permissão de localização é negada.

`REJEITADO` **nunca** é atribuído automaticamente — é sempre decisão humana,
com justificativa.

### Sequência chegada/saída

O servidor recusa (409) dois registros do mesmo tipo em sequência: não dá para
marcar duas chegadas sem uma saída no meio. O primeiro registro de um professor
precisa ser uma `CHEGADA`. O app usa `GET /checkin/ultimo` para desabilitar o
botão errado antes mesmo de o professor tentar.

### Registros offline

O app guarda o ponto no `AsyncStorage` com o horário declarado pelo aparelho e
reenvia quando a conexão volta. No servidor:

- `timestamp_servidor` continua sendo o momento em que o registro **chegou**;
- o horário declarado vai para `registrado_offline_em`, só para auditoria;
- o status é `PENDENTE_APROVACAO`, porque o servidor não tem como atestar
  quando o professor esteve no campus — quem confirma é o RH;
- o **relatório de jornada** usa `registrado_offline_em` quando existe, para as
  horas do dia baterem com a realidade, e marca o dia como inconsistente até a
  aprovação.

### Relatório de jornada

Agrupa por professor e por dia civil no fuso `RELATORIO_TIMEZONE`
(`America/Sao_Paulo`), pareia chegadas com saídas em ordem cronológica e aponta:

- `CHEGADA_SEM_SAIDA` — chegada sem saída correspondente;
- `SAIDA_SEM_CHEGADA` — saída sem chegada correspondente;
- `CHEGADA_DUPLICADA` — duas chegadas seguidas;
- `REGISTRO_PENDENTE` — há registro pendente de aprovação no dia.

Registros `REJEITADO` são descartados do cálculo. O dashboard exporta tudo em
CSV (separador `;` e BOM, para o Excel em pt-BR abrir com os acentos certos).

---

## LGPD e dados pessoais

**O sistema não coleta, não transmite e não armazena dado biométrico de nenhuma
natureza** — nem o dado bruto, nem o rótulo do método usado.

A biometria foi removida do produto por decisão de escopo (migration
`20260906120000_remove_biometria`): a coluna `registros_ponto.metodo_biometrico`
e o enum `MetodoBiometrico` deixaram de existir, o app não declara mais as
permissões `USE_BIOMETRIC`/`USE_FINGERPRINT` nem `NSFaceIDUsageDescription`, e a
dependência `expo-local-authentication` saiu do `package.json` do app.

Isso simplifica o enquadramento na LGPD: biometria é dado pessoal sensível
(art. 5º, II), e a forma mais segura de tratá-la é **não tratá-la**.

Dados pessoais que o sistema **de fato** guarda: nome, CPF, email, curso,
coordenadas do momento do registro e horários. A senha é armazenada como hash
bcrypt. As coordenadas são a única prova de presença — existem para justificar a
decisão de validar ou não o ponto, e ficam visíveis para o RH na trilha de
auditoria. A posição só é lida no instante em que o professor toca no botão,
nunca em segundo plano.

### Integridade do horário

O `timestamp_servidor` é gerado por `new Date()` dentro do handler do
`POST /checkin`. O schema zod do corpo não tem campo de horário e descarta
chaves desconhecidas, então um cliente adulterado que envie `timestamp` tem o
campo simplesmente ignorado. Há teste cobrindo isso
(`tests/integration/checkin.test.ts`, "ignora qualquer horário enviado pelo
cliente").

---

## Testes

```bash
npm test                              # tudo
npm run test:unit -w @univc/api       # só unitários (não precisam de banco)
npm run test:integration -w @univc/api
```

**61 testes**, divididos em:

- `tests/unit/geo.test.ts` — Haversine (distância conhecida, simetria,
  antimeridiano, antípodas) e a geocerca (borda do raio, escolha do campus mais
  próximo entre vários polos, raio por campus).
- `tests/unit/validacao-checkin.test.ts` — matriz de decisão do status
  (incluindo a varredura exaustiva que garante que nenhum motivo de biometria
  sobrou) e a regra de alternância chegada/saída.
- `tests/unit/jornada.test.ts` — pareamento, soma de horas, agrupamento por dia
  no fuso certo e cada tipo de inconsistência.
- `tests/integration/checkin.test.ts` — fluxo completo do `POST /checkin` contra
  um Postgres real: login, validação dentro do raio, pendência fora do raio,
  rejeição de horário forjado, recusa de payload sem coordenadas, compatibilidade
  com app antigo que ainda envie `metodo_biometrico`, sequência inválida, fila
  offline, auditoria, histórico, aprovação manual pelo RH e bloqueio de professor
  em rota de admin.
- `tests/integration/senha.test.ts` — RH redefine a senha de um professor
  (senha temporária de uso único, `deve_trocar_senha`, revogação dos refresh
  tokens ativos), professor troca a própria senha (`PATCH /auth/senha`,
  exige a senha atual), e o fluxo completo de ponta a ponta.

Os testes de integração usam `DATABASE_URL_TEST` (banco separado, truncado a
cada teste) e **se marcam como pulados** se o Postgres não estiver no ar, para
`npm test` não quebrar numa máquina sem Docker ligado.

---

## Decisões de projeto

- **Fastify em vez de Express** — integração melhor com TypeScript, rate limit
  oficial (`@fastify/rate-limit`) e `app.inject()`, que deixa o teste de
  integração rodar sem subir servidor HTTP.
- **`Admin` como modelo separado de `Professor`** — o RH não bate ponto e não
  tem curso vinculado; um enum `papel` no mesmo modelo deixaria metade das
  colunas sem sentido para metade das linhas.
- **Refresh token opaco no banco** — o access token é JWT stateless; o refresh
  fica no banco como hash, o que permite revogar sessão de professor desligado
  sem esperar o token expirar.
- **Contrato em `snake_case`, banco em `camelCase`** — o payload HTTP segue o
  que foi especificado; o Prisma mapeia para `snake_case` no banco via `@map`.
  A conversão fica isolada em `src/lib/serializar.ts`.
- **Timezone via `Intl`, sem biblioteca de datas** — `Intl.DateTimeFormat`
  resolve fuso e horário de verão sem dependência extra (`src/lib/datas.ts`).
- **Login genérico em falha** — email inexistente e senha errada devolvem a
  mesma mensagem, e a comparação roda contra um hash fictício quando o email não
  existe, para o tempo de resposta não denunciar quais emails estão cadastrados.

### Limitações conhecidas

- O `docker compose up` **não foi exercitado** no ambiente onde este código foi
  escrito (o pull de imagens do Docker Hub estava bloqueado por política de
  rede). A API, as migrations, o seed, os 53 testes e o dashboard foram
  validados contra um PostgreSQL 16 local; o `Dockerfile` e o `docker-compose.yml`
  seguem a mesma sequência de comandos, mas ainda não rodaram de ponta a ponta.
- `npm audit` acusa avisos em dependências de desenvolvimento do Expo (`metro`,
  `image-size`). O `npm audit fix --force` resolveria rebaixando o Expo para o
  SDK 53 — pior negócio. Nada disso entra no bundle do app.
- O app mobile não tem testes automatizados; a verificação foi typecheck e
  bundle completo pelo Metro.

---

## Fora do escopo do MVP

Por decisão do escopo, **não** estão implementados:

- qualquer forma de biometria — facial, digital ou do próprio dispositivo: a
  presença é comprovada só por localização (ver a seção de LGPD);
- totens físicos de ponto (fase 2);
- infraestrutura de produção/cloud, CI/CD, observabilidade;
- cadastro de professores e campi pela interface — hoje via seed ou
  `npx prisma studio`.
