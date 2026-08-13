import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Carrega o .env da raiz para descobrir DATABASE_URL_TEST antes de montar a
// configuracao. Os testes nunca tocam o banco de desenvolvimento.
for (const candidato of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
]) {
  if (existsSync(candidato)) {
    process.loadEnvFile(candidato);
    break;
  }
}

const urlBancoDeTeste =
  process.env.DATABASE_URL_TEST ??
  'postgresql://univc:univc@localhost:5432/univc_checkin_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup-global.ts'],
    // Os testes de integracao compartilham o mesmo banco: rodar em serie evita
    // que o TRUNCATE de um arquivo apague as fixtures de outro.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: urlBancoDeTeste,
      DATABASE_URL_TEST: urlBancoDeTeste,
      JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET ??
        'segredo-de-acesso-somente-para-testes-0123456789',
      JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET ??
        'segredo-de-refresh-somente-para-testes-0123456789',
      RELATORIO_TIMEZONE: process.env.RELATORIO_TIMEZONE ?? 'America/Sao_Paulo',
      // Limite alto para o teste de rate limit ser explicito e nao acidental.
      CHECKIN_RATE_LIMIT_MAX: '1000',
    },
  },
});
