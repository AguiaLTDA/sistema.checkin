import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const raizApi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireLocal = createRequire(import.meta.url);
// Chama o CLI do Prisma via `node <script>` em vez de `npx`/`npx.cmd`: evita o
// EINVAL do execFileSync ao tentar spawnar um .cmd diretamente no Windows.
const prismaCli = requireLocal.resolve('prisma/build/index.js');

/**
 * Aplica as migrations no banco de teste antes da suite rodar.
 *
 * Se o Postgres nao estiver no ar, apenas avisa: os testes unitarios continuam
 * rodando e os de integracao se marcam como pulados (ver tests/integration).
 */
export default async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn(
      '[testes] DATABASE_URL_TEST nao definida: testes de integracao serao pulados.',
    );
    return;
  }

  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: raizApi,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    console.warn(
      `[testes] nao foi possivel preparar o banco de teste (${detalhe.split('\n')[0]}).\n` +
        '[testes] suba o Postgres com `docker compose up -d db` para rodar os testes de integracao.',
    );
  }
}
