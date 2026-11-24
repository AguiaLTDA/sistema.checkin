import { env } from './env.js';
import {
  ArmazenamentoAppsScript,
  ArmazenamentoArquivo,
  ArmazenamentoMemoria,
  type Armazenamento,
} from './dados/armazenamento.js';
import { Banco } from './dados/banco.js';

/** Armazenamento conforme o .env (o importador cria instancias novas com ele). */
export function criarArmazenamento(): Armazenamento {
  switch (env.ARMAZENAMENTO) {
    case 'planilha':
      // env.ts ja garante que as duas variaveis existem quando e "planilha".
      return new ArmazenamentoAppsScript(env.APPS_SCRIPT_URL!, env.APPS_SCRIPT_CHAVE!);
    case 'arquivo':
      return new ArmazenamentoArquivo(env.ARQUIVO_DADOS);
    case 'memoria':
      return new ArmazenamentoMemoria();
  }
}

export const banco = new Banco(criarArmazenamento(), {
  cacheMs: env.PLANILHA_CACHE_SEGUNDOS * 1000,
});
