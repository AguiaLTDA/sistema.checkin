import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * O `.env` do projeto fica na raiz do monorepo, e nao em apps/api. O Prisma CLI
 * so procura no diretorio atual, entao carregamos o arquivo aqui antes de a CLI
 * ler `env("DATABASE_URL")`.
 */
if (!process.env.DATABASE_URL) {
  for (const candidato of [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ]) {
    if (existsSync(candidato)) {
      process.loadEnvFile(candidato);
      break;
    }
  }
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
