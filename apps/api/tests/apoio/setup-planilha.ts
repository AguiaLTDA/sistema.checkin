import { banco } from '../../src/banco.js';
import { criarGoogleFalso } from './google-falso.js';

/**
 * Setup da suite `test:planilha`: a API usa o armazenamento real do Apps Script
 * e o fetch global entrega cada chamada ao Code.gs rodando na planilha falsa.
 * Assim os testes de integracao passam pelo caminho completo de producao,
 * menos o Google em si.
 */
const google = criarGoogleFalso(process.env.APPS_SCRIPT_CHAVE);
globalThis.fetch = google.fetch;

// O $limpar dos testes precisa esvaziar a planilha falsa. A planilha real nao
// tem (e nunca tera) uma acao de apagar tudo: isto existe so aqui.
Object.assign(banco.armazenamento, {
  limpar: () => {
    for (const aba of google.planilha.abas.values()) aba.linhas = aba.linhas.slice(0, 1);
  },
});
