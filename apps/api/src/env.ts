import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const aquiDir = dirname(fileURLToPath(import.meta.url));

/**
 * Carrega o `.env` da raiz do monorepo (ou o `.env` local de apps/api, se
 * existir) sem depender de `dotenv`. Variaveis que ja estao no ambiente
 * (Render, Docker, configuracao dos testes) nunca sao sobrescritas: quem
 * define o ambiente tem a palavra final.
 */
function carregarArquivoEnv(): void {
  const candidatos = [resolve(process.cwd(), '.env')];

  // Sobe a arvore a partir deste arquivo ate achar o .env da raiz do monorepo.
  // Funciona tanto rodando de src/ (tsx) quanto de dist/ (build).
  let diretorio = aquiDir;
  for (let nivel = 0; nivel < 5; nivel += 1) {
    candidatos.push(resolve(diretorio, '.env'));
    diretorio = dirname(diretorio);
  }

  for (const caminho of candidatos) {
    if (!existsSync(caminho)) continue;
    try {
      const valores = parseEnv(readFileSync(caminho, 'utf8'));
      for (const [chave, valor] of Object.entries(valores)) {
        if (process.env[chave] === undefined) process.env[chave] = valor;
      }
      return;
    } catch {
      // Arquivo ilegivel ou malformado: seguimos com as variaveis do processo.
    }
  }
}

carregarArquivoEnv();

/** Variavel definida mas vazia (comum no painel do Render) conta como ausente. */
const opcional = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Onde os dados ficam:
   *  - `planilha`: Google Sheets via Web App do Apps Script (producao);
   *  - `arquivo`: JSON local, para desenvolver sem planilha;
   *  - `memoria`: some ao reiniciar (testes).
   * Sem valor: `planilha` se APPS_SCRIPT_URL estiver definida; senao
   * `memoria` nos testes e `arquivo` no desenvolvimento.
   */
  ARMAZENAMENTO: opcional(z.enum(['planilha', 'arquivo', 'memoria'])),
  /** URL do Web App implantado (termina em /exec). */
  APPS_SCRIPT_URL: opcional(
    z.string().url('APPS_SCRIPT_URL deve ser a URL do Web App (https://script.google.com/.../exec)'),
  ),
  /** Mesmo valor da propriedade CHAVE_API configurada no Apps Script. */
  APPS_SCRIPT_CHAVE: opcional(
    z.string().min(32, 'APPS_SCRIPT_CHAVE precisa de ao menos 32 caracteres'),
  ),
  /** De quanto em quanto tempo a API rele a planilha (pega edicoes manuais). */
  PLANILHA_CACHE_SEGUNDOS: z.coerce.number().int().nonnegative().default(60),
  /** Arquivo usado quando ARMAZENAMENTO=arquivo. */
  ARQUIVO_DADOS: z.string().default(resolve(aquiDir, '../.dados/banco.json')),

  API_PORT: z.coerce.number().int().positive().default(3333),
  API_HOST: z.string().default('0.0.0.0'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET precisa de ao menos 32 caracteres'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET precisa de ao menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  /** Lista separada por virgula; use `*` para liberar qualquer origem no dev. */
  CORS_ORIGINS: z.string().default('*'),

  CHECKIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  CHECKIN_RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  RELATORIO_TIMEZONE: z.string().default('America/Sao_Paulo'),
});

const resultado = envSchema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Variaveis de ambiente invalidas:\n${problemas}\n\nCopie .env.example para .env e ajuste os valores.`,
  );
}

const lido = resultado.data;

const armazenamento =
  lido.ARMAZENAMENTO ??
  (lido.APPS_SCRIPT_URL ? 'planilha' : lido.NODE_ENV === 'test' ? 'memoria' : 'arquivo');

if (armazenamento === 'planilha' && (!lido.APPS_SCRIPT_URL || !lido.APPS_SCRIPT_CHAVE)) {
  throw new Error(
    'Armazenamento "planilha" exige APPS_SCRIPT_URL e APPS_SCRIPT_CHAVE (veja o README, secao "Banco de dados no Google Sheets").',
  );
}

// Em producao so a planilha guarda dados de verdade: arquivo ou memoria no
// Render seriam apagados a cada deploy, sem nenhum aviso.
if (lido.NODE_ENV === 'production' && armazenamento !== 'planilha') {
  throw new Error(
    'Em producao o armazenamento precisa ser a planilha: defina APPS_SCRIPT_URL e APPS_SCRIPT_CHAVE.',
  );
}

export const env = { ...lido, ARMAZENAMENTO: armazenamento };

export const origensCors =
  env.CORS_ORIGINS.trim() === '*'
    ? true
    : env.CORS_ORIGINS.split(',')
        .map((origem) => origem.trim())
        .filter(Boolean);
