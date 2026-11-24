import { defineConfig } from 'vitest/config';

/**
 * Roda os testes de integracao com ARMAZENAMENTO=planilha: cada operacao vai
 * por HTTP (fetch) ate o Code.gs real, executado numa planilha simulada.
 * Cache zerado para a API reler a planilha a cada consulta e exercitar a
 * leitura de verdade, nao a copia em memoria.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/apoio/setup-planilha.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      ARMAZENAMENTO: 'planilha',
      APPS_SCRIPT_URL: 'https://script.google.com/macros/s/teste/exec',
      APPS_SCRIPT_CHAVE: 'chave-de-teste-'.padEnd(64, 'x'),
      PLANILHA_CACHE_SEGUNDOS: '0',
      JWT_ACCESS_SECRET: 'segredo-de-acesso-somente-para-testes-0123456789',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-somente-para-testes-0123456789',
      RELATORIO_TIMEZONE: 'America/Sao_Paulo',
      CHECKIN_RATE_LIMIT_MAX: '1000',
    },
  },
});
