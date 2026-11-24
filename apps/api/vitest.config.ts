import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Os arquivos de integracao compartilham o mesmo banco em memoria do
    // processo: rodar em serie evita que o $limpar de um apague as fixtures
    // de outro.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // Nunca a planilha real: o motor de dados e o mesmo, so o armazenamento
      // muda.
      ARMAZENAMENTO: 'memoria',
      JWT_ACCESS_SECRET: 'segredo-de-acesso-somente-para-testes-0123456789',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-somente-para-testes-0123456789',
      RELATORIO_TIMEZONE: 'America/Sao_Paulo',
      // Limite alto para o teste de rate limit ser explicito e nao acidental.
      CHECKIN_RATE_LIMIT_MAX: '1000',
    },
  },
});
