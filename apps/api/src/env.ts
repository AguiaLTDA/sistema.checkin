import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const aquiDir = dirname(fileURLToPath(import.meta.url));

/**
 * Carrega o `.env` da raiz do monorepo (ou o `.env` local de apps/api, se
 * existir) usando o carregador nativo do Node, sem depender de `dotenv`.
 * Dentro do Docker as variaveis ja vem do compose e nao ha arquivo para ler.
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
      process.loadEnvFile(caminho);
      return;
    } catch {
      // Arquivo ilegivel ou malformado: seguimos com as variaveis do processo.
    }
  }
}

// Se DATABASE_URL ja veio do ambiente (docker compose, CI, setup de teste),
// o arquivo .env nao e lido — quem define o ambiente tem a palavra final.
if (!process.env.DATABASE_URL) {
  carregarArquivoEnv();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatoria'),
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

export const env = resultado.data;

export const origensCors =
  env.CORS_ORIGINS.trim() === '*'
    ? true
    : env.CORS_ORIGINS.split(',')
        .map((origem) => origem.trim())
        .filter(Boolean);
