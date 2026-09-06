# UNIVC Check-in

Controle de presença de professores do **Centro Universitário Vale do Cricaré (UNIVC)**.

O professor marca chegada e saída pelo celular, e o registro só é validado
automaticamente quando confere um fator:

1. **Geolocalização** — o servidor calcula, por Haversine, a distância entre a
   posição enviada e o campus mais próximo, e compara com o raio permitido
   daquele campus.

O app também pode acionar a **biometria do aparelho** (Face ID ou digital,
validados pelo próprio sistema operacional do celular; nenhum dado biométrico
chega ao servidor), mas ela é apenas informativa: fica registrada para
auditoria e não é exigida para validar o registro.

Registros fora do raio não são descartados: entram como `PENDENTE_APROVACAO`
e o RH decide, com justificativa obrigatória.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Subindo o ambiente](#subindo-o-ambiente)
- [Usuários de teste](#usuários-de-teste)
- [Rodando o app no Expo Go](#rodando-o-app-no-expo-go)
- [Testando o fluxo completo](#testando-o-fluxo-completo)
- [API](#api)
- [Regras de negócio](#regras-de-negócio)
- [LGPD e dados biométricos](#lgpd-e-dados-biométricos)
- [Testes](#testes)
- [Decisões de projeto](#decisões-de-projeto)
- [Fora do escopo do MVP](#fora-do-escopo-do-mvp)

---

## Arquitetura

Monorepo com npm workspaces:

```
sistema.checkin/
├── apps/
│   ├── api/          @univc/api        Fastify + Prisma + PostgreSQL
│   ├── dashboard/    @univc/dashboard  React + Vite + Tailwind (RH/coordenação)
│   └── mobile/       app Expo (React Native) — professores
├── packages/
│   └── shared/       @univc/shared     enums, schemas zod e tipos da API
├── docker/           init do Postgres
└── docker-compose.yml
```

| Camada    | Stack                                                                 |
| --------- | --------------------------------------------------------------------- |
| API       | Node 22, TypeScript, Fastify 5, Prisma 6, PostgreSQL 16, zod, JWT      |
| Dashboard | React 19, Vite, Tailwind 4, React Router                              |
| Mobile    | Expo SDK 57, React Native 0.86, `expo-location`, `expo-local-authentication` |
| Testes    | Vitest (unitários puros + integração contra Postgres real)            |

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
   coordenadas e aciona a biometria do aparelho.
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

Access token JWT de 15 min; refresh token de 7 dias, guardado no banco **apenas
como hash SHA-256** e rotacionado a cada uso.

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
  "latitude": -18.70046,
  "longitude": -39.86322,
  "metodo_biometrico": "FACE_ID", // FACE_ID | DIGITAL | NENHUM
  "precisao_metros": 12.4,        // opcional
  "sincronizado_offline": false,  // opcional
  "registrado_offline_em": "..."  // obrigatório se sincronizado_offline
}
```

Não existe campo de horário: o `timestamp_servidor` é sempre `now()` no backend.

### Admin (RH/coordenação)

| Método  | Rota                              | Descrição                                          |
| ------- | --------------------------------- | -------------------------------------------------- |
| `GET`   | `/admin/registros`                | todos os registros, filtros por curso/professor/status/tipo/período |
| `PATCH` | `/admin/registros/:id/aprovar`    | aprova um pendente (`justificativa_manual` obrigatória) |
| `PATCH` | `/admin/registros/:id/rejeitar`   | rejeita um pendente (idem)                          |
| `GET`   | `/admin/relatorio-jornada`        | pares chegada/saída, horas e inconsistências        |
| `GET`   | `/admin/professores`              | lista para os filtros do dashboard                  |
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

| Situação                                   | Status                |
| ------------------------------------------ | --------------------- |
| Dentro do raio do campus mais próximo      | `VALIDADO`            |
| Fora do raio do campus mais próximo        | `PENDENTE_APROVACAO`  |
| Nenhum campus cadastrado                   | `PENDENTE_APROVACAO`  |
| Registro vindo da fila offline             | `PENDENTE_APROVACAO`  |
| Decisão manual do RH                       | `VALIDADO`/`REJEITADO` |

A biometria do aparelho (`metodo_biometrico`) é registrada junto com o
check-in para fins de auditoria, mas não influencia o status — mesmo sem
confirmação (`NENHUM`), o registro segue a regra acima com base apenas na
geolocalização.

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

## LGPD e dados biométricos

**Nenhum dado biométrico bruto é coletado, transmitido ou armazenado em ponto
algum deste sistema.**

Como funciona na prática:

1. O app chama `expo-local-authentication`, que aciona a API nativa de biometria
   (Face ID / Touch ID / digital do Android).
2. A comparação acontece **dentro do aparelho**, no enclave seguro do sistema
   operacional. O app não tem acesso à imagem, ao template nem à digital — a
   API devolve apenas um booleano.
3. Ao servidor sobe somente o **rótulo do método** usado: `FACE_ID`, `DIGITAL`
   ou `NENHUM`, gravado em `registros_ponto.metodo_biometrico`.
4. Não há endpoint que receba imagem ou template biométrico, e nenhuma coluna do
   schema (`apps/api/prisma/schema.prisma`) armazena esse tipo de dado.
5. Os logs de auditoria guardam motivo, distância, tipo e método — nunca
   credenciais nem qualquer coisa derivada de biometria.

Isso é uma decisão de arquitetura, não um detalhe de implementação: a biometria
é um dado pessoal sensível (art. 5º, II da LGPD), e a forma mais segura de
tratá-la é **não tratá-la**. O sistema delega a verificação ao dispositivo e
guarda apenas a prova de que ela passou.

Dados pessoais que o sistema **de fato** guarda: nome, CPF, email, curso,
coordenadas do momento do registro e horários. A senha é armazenada como hash
bcrypt. As coordenadas existem para justificar a decisão de validar ou não o
ponto, e ficam visíveis para o RH na trilha de auditoria.

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

**53 testes**, divididos em:

- `tests/unit/geo.test.ts` — Haversine (distância conhecida, simetria,
  antimeridiano, antípodas) e a geocerca (borda do raio, escolha do campus mais
  próximo entre vários polos, raio por campus).
- `tests/unit/validacao-checkin.test.ts` — matriz de decisão do status e a
  regra de alternância chegada/saída.
- `tests/unit/jornada.test.ts` — pareamento, soma de horas, agrupamento por dia
  no fuso certo e cada tipo de inconsistência.
- `tests/integration/checkin.test.ts` — fluxo completo do `POST /checkin` contra
  um Postgres real: login, validação dentro do raio, pendência fora do raio,
  rejeição de horário forjado, sequência inválida, fila offline, auditoria,
  histórico, aprovação manual pelo RH e bloqueio de professor em rota de admin.

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

- reconhecimento facial via câmera ou comparação server-side (a biometria é do
  dispositivo, por design — ver a seção de LGPD);
- totens físicos de biometria (fase 2);
- infraestrutura de produção/cloud, CI/CD, observabilidade;
- cadastro de professores e campi pela interface — hoje via seed ou
  `npx prisma studio`.
