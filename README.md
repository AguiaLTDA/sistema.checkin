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
- [Banco de dados no Google Sheets](#banco-de-dados-no-google-sheets)
- [Migração do backup do Supabase](#migração-do-backup-do-supabase)
- [Deploy no Render](#deploy-no-render)
- [Deploy na VPS](#deploy-na-vps)
- [Usuários de teste](#usuários-de-teste)
- [Painel web (RH + usuário)](#4-painel-web-rh--usuário)
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
│   ├── api/            @univc/api            Fastify + camada de dados sobre o Google Sheets
│   ├── apps-script/    Code.gs               Web App do Apps Script que le/grava a planilha
│   ├── dashboard/      @univc/dashboard      React + Vite + Tailwind (RH/coordenação)
│   ├── professor-web/  @univc/professor-web  React + Vite (professores, no navegador)
│   └── mobile/         app Expo (React Native) — professores, alternativa nativa
├── packages/
│   └── shared/       @univc/shared     enums, schemas zod e tipos da API
└── docker-compose.yml
```

| Camada          | Stack                                                                 |
| --------------- | --------------------------------------------------------------------- |
| API             | Node 22, TypeScript, Fastify 5, zod, JWT                               |
| Dados           | Google Sheets, acessado por um Web App do Apps Script (`apps/apps-script/Code.gs`) |
| Dashboard       | React 19, Vite, Tailwind 4, React Router (RH/coordenação)              |
| App do professor | React 19, Vite, Tailwind 4 — roda no navegador, usa a Geolocation API do próprio aparelho |
| Mobile (Expo)   | Expo SDK 57, React Native 0.86, `expo-location` — alternativa nativa ao app web |
| Testes          | Vitest (unitários + integração, também pelo `Code.gs` numa planilha simulada) |

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

- Node 22+
- Docker + Docker Compose (opcional)

Não há banco para instalar. Em desenvolvimento a API grava num arquivo JSON
local; em produção, numa planilha do Google (veja
[Banco de dados no Google Sheets](#banco-de-dados-no-google-sheets)).

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Os valores padrão já funcionam em desenvolvimento. Com `APPS_SCRIPT_URL` vazia,
os dados vão para `apps/api/.dados/banco.json`, que fica fora do git porque
contém hashes de senha.

### 2. API com Docker

```bash
docker compose up -d --build
```

Sobe a API em `http://localhost:3333`, com os dados num volume Docker
(`dados`) e o seed rodando no boot (`RUN_SEED_ON_BOOT=true`). O seed é
idempotente e **nunca grava na planilha**.

Conferindo:

```bash
curl localhost:3333/health
docker compose logs -f api
```

### 3. Sem Docker

```bash
npm install                 # instala os workspaces e compila @univc/shared
npm run db:seed             # usuarios, campus e registros de exemplo
npm run dev:api             # http://localhost:3333
```

### 4. Painel web (RH + usuário)

O painel não está no compose (roda direto pelo Vite):

```bash
npm run dev:dashboard       # http://localhost:5173
```

Ele tem três áreas, cada uma com login próprio (as duas sessões convivem no
mesmo navegador):

| Endereço   | Para quem                                  | O que tem |
| ---------- | ------------------------------------------ | --------- |
| `/`        | todos                                      | página inicial com os dois acessos centralizados e a lista de funcionalidades de cada um |
| `/rh`      | RH e coordenação (login em `/auth/admin/login`) | registros, aprovações pendentes, relatório de jornada, **cadastro de usuários** e **perfis** |
| `/usuario` | professores, estagiários e estudantes (login em `/auth/login`) | marcar chegada/saída com a localização do navegador, troca de senha obrigatória no primeiro acesso, último registro e histórico |

Os dois painéis têm um botão no cabeçalho que leva ao outro. O ponto marcado no
Painel do Usuário segue a mesma regra do app: a presença é comprovada só pela
localização (dentro do raio do campus, validado na hora; fora dele, pendente de
aprovação do RH — regra em `apps/api/src/lib/validacao-checkin.ts`). A
localização do navegador só funciona em HTTPS ou em `localhost`. No primeiro
acesso, ou depois de o RH redefinir a senha, o usuário é levado à tela de troca
de senha antes de usar o painel.

Screenshots de cada tela ficam em [`docs/telas/`](docs/telas/).

#### Usuários e perfis

- **Perfis** (`/rh/perfis`): *Professor*, *Estagiário* e *Estudante* vêm do
  seed (local) ou da importação do backup (produção). O RH cria outros, renomeia (o novo nome vale para todos os
  usuários do perfil) e desativa (o perfil some do cadastro, mas quem já o usa
  continua com ele).
- **Usuários** (`/rh/usuarios`): o RH cria o acesso com nome, CPF, email (que é
  o login), curso ou setor (a tela sugere os cursos da UNIVC) e perfil. O RH
  nunca escolhe a senha: o sistema gera uma temporária, mostrada uma única vez
  para o RH repassar, e o usuário a troca no primeiro login. Também dá para
  editar (inclusive trocar o perfil), desativar, apagar e redefinir a senha.
- Os filtros de registros, pendentes e jornada aceitam filtrar por perfil.
- O endereço `/usuario` do dashboard e o app separado da seção 5 (`apps/professor-web`)
  usam as mesmas rotas da API; o segundo é uma alternativa publicada à parte.

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
| `npm run db:seed`       | popula campus, RH, professores e registros de exemplo (nunca na planilha real) |
| `npm run importar:supabase -- <backup>` | simula a importação do backup do Supabase (`--aplicar` grava) |
| `npm test`              | suíte completa da API (memória + caminho da planilha)  |
| `npm run typecheck`     | typecheck de todos os workspaces                     |
| `npm run docker:logs`   | logs da API no compose                               |

---

## Banco de dados no Google Sheets

Em produção os dados ficam numa planilha do Google. Cada tabela é uma aba
(`professores`, `perfis`, `admins`, `campi`, `registros_ponto`,
`refresh_tokens`, `logs_auditoria`), com os mesmos nomes de coluna do antigo
banco Postgres.

A API (no Render) não fala com a planilha diretamente: ela chama um **Web App
do Apps Script** ([`apps/apps-script/Code.gs`](apps/apps-script/Code.gs)), que
só lê abas e aplica lotes de escrita. Toda a regra de negócio continua na API.

```
navegador / app ──HTTPS──> API (Render) ──HTTPS + chave──> Apps Script ──> planilha
```

Como a API trata os dados:

- **Cópia em memória, gravação imediata.** A API lê cada aba quando precisa e
  guarda uma cópia. Toda escrita vai para a planilha antes de a requisição
  terminar; se a planilha falhar, a mudança é desfeita na memória e o usuário
  recebe um erro 503 ("tente novamente"). Nada fica gravado só pela metade.
- **Releitura periódica.** A cada `PLANILHA_CACHE_SEGUNDOS` (60 por padrão) a
  API relê as abas, então correções feitas à mão na planilha aparecem sozinhas.
  Se o Google falhar numa releitura, a API segue com a cópia que tem.
- **Tudo é texto na planilha.** O `Code.gs` grava cada valor com um apóstrofo
  na frente (invisível na célula). Isso impede o Sheets de transformar CPF com
  zero inicial em número, data ISO em data local e, principalmente, texto que
  comece com `=` em fórmula executável.
- **Unicidade e cascata** (email/CPF únicos, apagar professor apaga os
  registros dele) são garantidas pela API, como eram pelo Postgres.

### Configurar a planilha (uma vez)

1. Na conta Google da instituição, crie uma planilha nova (ex.: *UNIVC
   Check-in — base de dados*). **Não a compartilhe com ninguém** (veja a seção
   de LGPD).
2. Na planilha: **Extensões → Apps Script**. Apague o conteúdo do `Code.gs`,
   cole o de [`apps/apps-script/Code.gs`](apps/apps-script/Code.gs) e salve.
3. No seletor de funções do editor, escolha **`configurarChave`** e clique em
   **Executar**. O Google pede autorização: o script só pede acesso **a esta
   planilha** (anotação `@OnlyCurrentDoc`). Depois, abra o **Registro de
   execução** e copie a chave mostrada. Ela é a `APPS_SCRIPT_CHAVE`.
4. Escolha **`testarConfiguracao`** e execute. O registro precisa mostrar
   `Autoteste de formatacao: APROVADO`.
5. **Implantar → Nova implantação → App da Web**:
   - *Executar como*: **Eu**;
   - *Quem pode acessar*: **Qualquer pessoa**.

   Copie a URL terminada em `/exec`. Ela é a `APPS_SCRIPT_URL`.
6. Opcional: abra a URL no navegador. A resposta deve ser
   `{"ok":true,"servico":"univc-checkin","versao":1}`.

> **"Qualquer pessoa" é necessário** para o Render chamar o Web App sem login
> do Google. A proteção é a chave: sem ela, toda chamada é recusada. Trate a URL
> e a chave como senhas. Para trocar a chave, rode `configurarChave` de novo e
> atualize `APPS_SCRIPT_CHAVE` no Render.

> **Atualizar o `Code.gs` depois**: cole a nova versão, salve e use
> **Implantar → Gerenciar implantações → editar → Versão: Nova versão**. Assim a
> URL continua a mesma. Uma "Nova implantação" geraria outra URL.

As abas e colunas são criadas automaticamente pela API no primeiro acesso.

### Editar a planilha à mão

Pode, com cuidado. As alterações aparecem na API em até
`PLANILHA_CACHE_SEGUNDOS`.

- Não renomeie abas nem colunas, não altere a coluna `id` e não deixe vazias
  células obrigatórias.
- Se uma célula ficar inválida (texto numa coluna numérica, status
  inexistente...), a API responde 503 dizendo **aba, coluna e id da linha**.
  Basta corrigir a célula.
- Para o dia a dia, prefira o painel do RH: edições manuais na planilha **não
  entram na trilha de auditoria**.

### Limites

- **Uma instância da API.** A cópia em memória é por processo. Com duas
  instâncias, uma não veria as escritas da outra até a releitura.
- **Cada escrita leva cerca de 1–2 s** (ida e volta ao Apps Script), e as
  execuções do Apps Script estão sujeitas às cotas diárias da conta Google.
- **Tamanho.** Uma planilha comporta até 10 milhões de células. `logs_auditoria`
  é a aba que mais cresce; acompanhe e arquive linhas antigas quando necessário.
- **Cópias de segurança.** O Sheets mantém histórico de versões
  (*Arquivo → Histórico de versões*). Para uma cópia independente, use
  *Arquivo → Fazer uma cópia* ou baixe como `.xlsx` periodicamente.

---

## Migração do backup do Supabase

O banco anterior (Supabase) foi pausado no plano gratuito. Pelo painel dá para
baixar o backup (`db_cluster-*.backup.gz`) sem reativar o projeto, e o
importador leva esse arquivo para a planilha:

```bash
# Com APPS_SCRIPT_URL e APPS_SCRIPT_CHAVE no .env:
npm run importar:supabase -- /caminho/db_cluster-14-09-2026.backup.gz            # simula
npm run importar:supabase -- /caminho/db_cluster-14-09-2026.backup.gz --aplicar  # grava
```

O que ele faz:

1. Lê os blocos `COPY` do dump, sem executar nenhum SQL do arquivo.
2. Converte para o esquema atual. Num backup anterior aos perfis, cria os
   perfis *Professor*, *Estagiário* e *Estudante* e vincula quem já existia a
   *Professor*, exatamente como a migration de outubro fazia.
3. Valida tudo antes de gravar: unicidade, referências e uma ida e volta de
   cada valor pela codificação da planilha. **Qualquer coisa que não possa ser
   levada sem perda aborta a importação.**
4. Com `--aplicar`: roda o autoteste de formatação na planilha real, recusa
   planilha que já tenha dados, grava aba por aba e, no fim, **relê tudo e
   confere campo a campo com o backup**.

Os hashes de senha vão junto, então todo mundo continua entrando com a mesma
senha. Não versione o arquivo do backup: ele contém dados pessoais.

---

## Deploy no Render

Os dados ficam na planilha (seção anterior). O
[`render.yaml`](render.yaml) na raiz descreve dois serviços:

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
   - **`univc-checkin-api`** → `APPS_SCRIPT_URL` e `APPS_SCRIPT_CHAVE`, da
     [configuração da planilha](#configurar-a-planilha-uma-vez). Sem elas a
     API se recusa a subir em produção. `CORS_ORIGINS` pode ficar em branco
     por enquanto, porque é ajustada no passo 4.
   - **`univc-checkin-dashboard`** → `VITE_API_URL`: também deixe em branco
     por enquanto.
3. Deploy inicial: a API sobe (criando abas e colunas que faltarem na
   planilha) e o dashboard builda, mas sem as URLs cruzadas o CORS ainda barra
   as chamadas. Anote as duas URLs que o Render atribuiu, do tipo
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

> **Serviço já existente, que usava o Supabase**: em *Environment*, apague
> `DATABASE_URL` (e `RUN_MIGRATIONS_ON_BOOT`, se existir) e adicione
> `APPS_SCRIPT_URL` e `APPS_SCRIPT_CHAVE`. O próximo deploy já sobe sobre a
> planilha.

---

## Deploy na VPS

Alternativa ao Render: rodar a API, o dashboard e o app do professor em
containers Docker numa VPS própria, atrás de um Caddy que já esteja
publicando outros serviços na mesma máquina (é o caso da VPS de referência
deste projeto, que também roda o `agente-univc`). Os dados ficam na planilha
do Google (veja [Banco de dados no Google Sheets](#banco-de-dados-no-google-sheets)),
então este compose não sobe banco nenhum.

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
   # edite .env.production: APPS_SCRIPT_URL e APPS_SCRIPT_CHAVE, JWT secrets
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

Criados pelo seed (`apps/api/scripts/seed.ts`) no ambiente local:

**Painel do RH — `http://localhost:5173/rh`**

| Email         | Senha      |
| ------------- | ---------- |
| `rh@univc.br` | `admin123` |

**Painel do Usuário (`http://localhost:5173/usuario`) e app mobile — senha `senha123` para todos**

| Email                       | Perfil     | Curso               |
| --------------------------- | ---------- | ------------------- |
| `ana.rocha@univc.br`        | Professor  | Direito             |
| `carlos.menezes@univc.br`   | Professor  | Odontologia         |
| `mariana.prado@univc.br`    | Professor  | Enfermagem          |
| `rafael.portela@univc.br`   | Professor  | Medicina Veterinária |
| `juliana.lima@univc.br`     | Professor  | Administração       |
| `lucas.dias@univc.br`       | Estagiário | Análise e Desenvolvimento de Sistemas |
| `beatriz.ramos@univc.br`    | Estudante  | Psicologia          |

**Campus cadastrado**

| Nome                        | Latitude    | Longitude   | Raio  |
| --------------------------- | ----------- | ----------- | ----- |
| Campus São Mateus - UNIVC   | `-18.7228125` | `-39.8451875` | 300 m |

> A coordenada vem do Plus Code oficial do campus (`75G3+VW`, R. Humberto de
> Almeida Francklin, 217, Universitário, São Mateus/ES), conferida com uma
> segunda referência em graus/minutos/segundos (diferença de ~20 m). Em
> produção, o campus vive na aba **`campi`** da planilha: é lá que se corrige a
> coordenada ou o raio, ou se acrescenta um polo novo. O modelo aceita vários
> campi, e a validação sempre usa o raio do campus mais próximo.

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
  `-18.7228125`, longitude `-39.8451875`.
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

#### Gestão de usuários e perfis pelo RH

O dashboard (abas **Usuarios** e **Perfis**) cobre o ciclo completo do cadastro,
sem precisar mexer na planilha:

- **Cadastrar** — nome, CPF, email, curso ou setor e perfil. Uma senha
  temporária é gerada na hora (mesma mecânica do reset) e o usuário é
  obrigado a trocá-la no primeiro login.
- **Editar** — nome, CPF, email, curso e perfil, a qualquer momento.
- **Ativar/Desativar** — desliga o acesso sem apagar o histórico.
- **Apagar** — remove o usuário definitivamente, e os registros de ponto
  dele saem junto (cascade no schema). Ação irreversível, com confirmação.
- **Minha conta** (`/rh/conta`, pelo nome no cabeçalho) — o RH logado edita o
  próprio nome e email (o email é o login) e troca a própria senha, informando
  a senha atual. A troca de senha encerra todas as sessões do RH, então é
  preciso entrar de novo. Não há tela para editar outro administrador.
- **Perfis** — *Professor*, *Estagiário* e *Estudante* já vêm criados; o RH
  cria outros, renomeia e desativa (perfil desativado some do cadastro, mas
  quem já o usa continua com ele).

Toda criação, edição e exclusão gera uma entrada em `logs_auditoria`
(`CRIACAO_PROFESSOR`, `EDICAO_PROFESSOR`, `EXCLUSAO_PROFESSOR`, `PERFIL_CRIADO`,
`PERFIL_ATUALIZADO`, `EDICAO_ADMIN`, `ALTERACAO_SENHA`).

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
  "latitude": -18.7228125,        // obrigatória
  "longitude": -39.8451875,       // obrigatória
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
| `GET`   | `/admin/professores`              | usuários que batem ponto, com perfil — alimenta os filtros e a tela de gestão |
| `POST`  | `/admin/professores`              | cadastra um usuário com `perfil_id` (gera senha temporária, força troca no primeiro login) |
| `PATCH` | `/admin/professores/:id`          | edita nome/CPF/email/curso/perfil/ativo             |
| `DELETE`| `/admin/professores/:id`          | apaga definitivamente um professor (e os registros de ponto dele, em cascata) |
| `PATCH` | `/admin/professores/:id/redefinir-senha` | gera senha temporária e força troca no próximo login |
| `GET`   | `/admin/cursos`                   | cursos distintos                                    |
| `GET`   | `/admin/campi`                    | campi cadastrados                                   |
| `PATCH` | `/admin/conta`                    | o RH logado edita o próprio nome e/ou email (email repetido responde 409) |
| `PATCH` | `/admin/conta/senha`              | o RH logado troca a própria senha (`senha_atual` + `senha_nova`); encerra as sessões do RH |
| `GET`   | `/admin/perfis`                   | perfis com total de usuários                        |
| `POST`  | `/admin/perfis`                   | cria perfil (`nome`, `descricao`)                   |
| `PATCH` | `/admin/perfis/:id`               | renomeia, muda a descrição ou ativa/desativa        |

`/admin/registros` e `/admin/relatorio-jornada` também aceitam `perfil_id`.
Email ou CPF repetido responde 409; cadastrar com perfil inexistente ou
desativado responde 400.

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

### A planilha é o banco de dados

Tudo isso mora na planilha do Google, e **quem tiver acesso a ela vê tudo**:
CPFs, emails, hashes de senha e as coordenadas de cada registro. Por isso:

- a planilha fica na conta institucional e **não é compartilhada** com
  ninguém. O RH usa o painel, não a planilha;
- o Apps Script roda como o dono da planilha e só tem acesso a ela
  (`@OnlyCurrentDoc`);
- a URL do Web App e a `APPS_SCRIPT_CHAVE` são credenciais: ficam só nas
  variáveis de ambiente do Render, nunca no repositório;
- as cópias de segurança (`.xlsx`, "Fazer uma cópia") e o backup antigo do
  Supabase têm os mesmos dados e merecem o mesmo cuidado.

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
npm test                                # tudo: memória + caminho da planilha
npm run test:unit -w @univc/api         # só unitários
npm run test:integration -w @univc/api  # integração com armazenamento em memória
npm run test:planilha -w @univc/api     # integração passando pelo Code.gs
```

Nenhum teste precisa de serviço externo. A integração roda duas vezes:

- **em memória**, rápida, sobre o mesmo motor de dados usado em produção;
- **pelo caminho da planilha**: cada operação vai por HTTP até o `Code.gs`
  real, executado numa planilha simulada (`tests/apoio/google-falso.ts`). Essa
  planilha reproduz o comportamento do Sheets que mais estraga dado: converte
  texto que parece número ou data e executa texto que começa com `=`. Se a
  proteção do apóstrofo falhar, os testes acusam.

Além dos arquivos abaixo, `tests/unit/banco.test.ts` cobre a camada de dados
(desfazer ao falhar a gravação, unicidade, cascata, releitura, codificação),
`tests/unit/apps-script.test.ts` cobre o `Code.gs` (chave, lote validado antes
de escrever, idempotência, remoção em bloco, autoteste) e
`tests/unit/importacao.test.ts` cobre a importação do backup.

Os demais testes:

- `tests/unit/geo.test.ts` — Haversine (distância conhecida, simetria,
  antimeridiano, antípodas) e a geocerca (borda do raio, escolha do campus mais
  próximo entre vários polos, raio por campus).
- `tests/unit/validacao-checkin.test.ts` — matriz de decisão do status
  (incluindo a varredura exaustiva que garante que nenhum motivo de biometria
  sobrou) e a regra de alternância chegada/saída.
- `tests/unit/jornada.test.ts` — pareamento, soma de horas, agrupamento por dia
  no fuso certo e cada tipo de inconsistência.
- `tests/integration/checkin.test.ts` — fluxo completo do `POST /checkin`: login, validação dentro do raio, pendência fora do raio,
  rejeição de horário forjado, recusa de payload sem coordenadas, compatibilidade
  com app antigo que ainda envie `metodo_biometrico`, sequência inválida, fila
  offline, auditoria, histórico, aprovação manual pelo RH e bloqueio de professor
  em rota de admin.
- `tests/integration/senha.test.ts` — RH redefine a senha de um professor
  (senha temporária de uso único, `deve_trocar_senha`, revogação dos refresh
  tokens ativos), professor troca a própria senha (`PATCH /auth/senha`,
  exige a senha atual), e o fluxo completo de ponta a ponta.
- `tests/integration/professores.test.ts` — RH cadastra, edita, ativa/desativa
  e apaga professores (`POST`/`PATCH`/`DELETE /admin/professores[/:id]`):
  conflito de email/CPF duplicado, validação de CPF, 404 para id inexistente,
  bloqueio de professor tentando usar as rotas, e a exclusão em cascata dos
  registros de ponto.

O banco dos testes é esvaziado antes de cada teste com `banco.$limpar()`, que
só existe em armazenamento de teste: chamá-lo com a planilha real dá erro.

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
- **Contrato em `snake_case`, modelos em `camelCase`** — o payload HTTP segue o
  que foi especificado, e as colunas da planilha mantêm os nomes `snake_case`
  do antigo Postgres (`src/dados/esquema.ts`). A conversão para a API fica
  isolada em `src/lib/serializar.ts`.
- **Google Sheets como banco, com a API no meio** — a planilha não pausa por
  inatividade (o motivo da saída do Supabase) e o RH consegue consultar os
  dados direto nela. O navegador nunca fala com o Apps Script: Web Apps não
  aceitam o cabeçalho `Authorization` por CORS, e manter a API no meio preserva
  login, validação, rate limit e auditoria.
- **Camada de dados com a mesma interface do Prisma** — `src/dados/banco.ts`
  implementa só o subconjunto que as rotas usam (`findMany`, `update`,
  `$transaction`...), então a troca de banco não mexeu na regra de negócio, e os
  testes existentes passaram sem alteração de lógica. Campo ou operador fora
  desse subconjunto gera erro em vez de ser ignorado em silêncio.
- **Timezone via `Intl`, sem biblioteca de datas** — `Intl.DateTimeFormat`
  resolve fuso e horário de verão sem dependência extra (`src/lib/datas.ts`).
- **Login genérico em falha** — email inexistente e senha errada devolvem a
  mesma mensagem, e a comparação roda contra um hash fictício quando o email não
  existe, para o tempo de resposta não denunciar quais emails estão cadastrados.

### Limitações conhecidas

- O `Code.gs` foi testado num ambiente Google **simulado**, não contra o Google
  de verdade. O comportamento do apóstrofo é verificado na planilha real pelo
  autoteste (`testarConfiguracao` e o importador, que não grava se ele falhar).
- O `docker compose up` **não foi exercitado** no ambiente onde este código foi
  escrito (o pull de imagens do Docker Hub estava bloqueado por política de
  rede). O `Dockerfile` segue os mesmos passos de build validados localmente.
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
- cadastro de campi pela interface — hoje direto na aba `campi` da planilha
  (professores já têm CRUD completo no dashboard, aba **Usuarios**).
