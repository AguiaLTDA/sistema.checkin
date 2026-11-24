/**
 * Importa o backup do Supabase (db_cluster-*.backup ou .backup.gz) para o
 * armazenamento configurado — a planilha, quando APPS_SCRIPT_URL e
 * APPS_SCRIPT_CHAVE estao definidas.
 *
 *   npm run importar:supabase -w @univc/api -- <arquivo>            simula
 *   npm run importar:supabase -w @univc/api -- <arquivo> --aplicar  grava
 *
 * Garantias:
 *  - sem --aplicar nada e gravado: so le, converte, valida e mostra o relatorio;
 *  - aborta antes de gravar se algum valor nao puder ser levado sem perda;
 *  - na planilha, roda o autoteste de formatacao antes e so grava se passar;
 *  - so grava em armazenamento vazio (nunca mistura com dados existentes);
 *  - depois de gravar, rele tudo com uma instancia nova e confere campo a campo.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { criarArmazenamento } from '../src/banco.js';
import { TABELAS } from '../src/dados/esquema.js';
import { ORDEM_IMPORTACAO, aplicarImportacao } from './importacao.js';
import { converterDump } from './supabase-dump.js';

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const aplicar = argumentos.includes('--aplicar');
  const arquivo = argumentos.find((a) => !a.startsWith('--'));
  if (!arquivo) {
    throw new Error('Informe o arquivo do backup: npm run importar:supabase -- <arquivo> [--aplicar]');
  }

  const bruto = readFileSync(arquivo);
  const texto = (arquivo.endsWith('.gz') ? gunzipSync(bruto) : bruto).toString('utf8');
  const dados = converterDump(texto);

  console.log('\n=== Backup lido e validado ===');
  for (const modelo of ORDEM_IMPORTACAO) {
    console.log(
      `  ${TABELAS[modelo].aba.padEnd(16)} ${String(dados.linhas[modelo].length).padStart(5)} linha(s)`,
    );
  }
  if (dados.ignoradas.length) {
    console.log(`  (tabelas sem aba correspondente, ignoradas: ${dados.ignoradas.join(', ')})`);
  }
  for (const aviso of dados.avisos) console.log(`  aviso: ${aviso}`);
  console.log('  ok: todos os valores sobrevivem a ida e volta pela codificacao da planilha');
  console.log(`\nDestino: ${criarArmazenamento().descricao}`);

  if (!aplicar) {
    console.log('\nSimulacao: nada foi gravado. Rode de novo com --aplicar para importar.\n');
    return;
  }

  const { conferidas } = await aplicarImportacao(dados, criarArmazenamento);
  console.log(`\nImportacao concluida: ${conferidas} linha(s) conferidas campo a campo com o backup.\n`);
}

principal().catch((erro: unknown) => {
  console.error(`\nFalha na importacao: ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
});
