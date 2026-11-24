import { isDeepStrictEqual } from 'node:util';
import { ArmazenamentoAppsScript, type Armazenamento } from '../src/dados/armazenamento.js';
import { Banco, type Delegados } from '../src/dados/banco.js';
import { MODELOS, TABELAS, type NomeModelo } from '../src/dados/esquema.js';
import type { DadosImportados } from './supabase-dump.js';

/** Ordem que respeita as referencias entre abas. */
export const ORDEM_IMPORTACAO: NomeModelo[] = [
  'perfil',
  'admin',
  'campus',
  'professor',
  'registroPonto',
  'refreshToken',
  'logAuditoria',
];
const POR_LOTE = 300;

type DelegadoGenerico = {
  count(): Promise<number>;
  findMany(): Promise<Record<string, unknown>[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
};

function delegado(banco: Delegados, modelo: NomeModelo): DelegadoGenerico {
  return banco[modelo] as unknown as DelegadoGenerico;
}

/**
 * Grava os dados convertidos e confere. `criarArmazenamento` e chamada duas
 * vezes: uma para gravar e outra para reler do zero na conferencia, sem
 * aproveitar nenhum cache da gravacao.
 *
 * Nao grava nada se: o autoteste da planilha falhar, ou qualquer aba de
 * destino ja tiver dados.
 */
export async function aplicarImportacao(
  dados: DadosImportados,
  criarArmazenamento: () => Armazenamento,
  log: (mensagem: string) => void = console.log,
): Promise<{ conferidas: number }> {
  const armazenamento = criarArmazenamento();

  if (armazenamento instanceof ArmazenamentoAppsScript) {
    const teste = await armazenamento.autoteste();
    if (!teste.aprovado) {
      throw new Error(
        `Autoteste de formatacao da planilha falhou; nada foi gravado:\n  ${teste.falhas.join('\n  ')}`,
      );
    }
    log('Autoteste de formatacao da planilha: aprovado');
  }

  const banco = new Banco(armazenamento, { cacheMs: 0 });
  await banco.iniciar();
  for (const modelo of MODELOS) {
    const existentes = await delegado(banco, modelo).count();
    if (existentes > 0) {
      throw new Error(
        `A aba ${TABELAS[modelo].aba} ja tem ${existentes} linha(s). Importe numa planilha vazia; nada foi gravado.`,
      );
    }
  }

  for (const modelo of ORDEM_IMPORTACAO) {
    const todas = dados.linhas[modelo];
    for (let inicio = 0; inicio < todas.length; inicio += POR_LOTE) {
      const lote = todas.slice(inicio, inicio + POR_LOTE);
      await banco.$transaction(async (tx) => {
        for (const linha of lote) await delegado(tx, modelo).create({ data: linha });
      });
    }
    log(`  gravado: ${TABELAS[modelo].aba} (${todas.length})`);
  }

  const conferencia = new Banco(criarArmazenamento(), { cacheMs: 0 });
  let conferidas = 0;
  for (const modelo of ORDEM_IMPORTACAO) {
    const gravadas = await delegado(conferencia, modelo).findMany();
    const esperadas = dados.linhas[modelo];
    if (gravadas.length !== esperadas.length) {
      throw new Error(
        `Conferencia: ${TABELAS[modelo].aba} tem ${gravadas.length} linha(s), esperado ${esperadas.length}.`,
      );
    }
    const porId = new Map(gravadas.map((linha) => [linha.id as string, linha]));
    for (const original of esperadas) {
      if (!isDeepStrictEqual(porId.get(original.id as string), original)) {
        throw new Error(
          `Conferencia: linha ${String(original.id)} de ${TABELAS[modelo].aba} difere do backup.`,
        );
      }
      conferidas += 1;
    }
  }
  return { conferidas };
}
