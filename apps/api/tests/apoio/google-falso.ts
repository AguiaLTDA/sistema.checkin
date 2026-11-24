import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * Ambiente Google simulado para executar o `apps/apps-script/Code.gs` real
 * dentro do Node. A planilha falsa reproduz o comportamento que justifica o
 * apostrofo no Code.gs: texto sem apostrofo que parece numero, booleano ou
 * data e convertido, e texto comecando com "=" vira formula. So o que o Code.gs
 * grava corretamente volta intacto.
 *
 * Nao substitui o autoteste na planilha real (o importador roda os dois).
 */

const caminhoCodeGs = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps-script/Code.gs',
);

type Celula = string | number | boolean | Date;

/** O que a planilha faz com um valor recebido por setValue(s). */
function comoAPlanilhaGuarda(valor: unknown): Celula {
  if (typeof valor !== 'string') return valor as Celula;
  if (valor.startsWith("'")) return valor.slice(1);
  if (valor.startsWith('=')) return '#FORMULA_EXECUTADA';
  if (/^-?\d+(\.\d+)?$/.test(valor)) return Number(valor);
  if (/^(true|false)$/i.test(valor)) return valor.toUpperCase() === 'TRUE';
  if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) return new Date(valor);
  return valor;
}

class AbaFalsa {
  linhas: Celula[][] = [];
  congeladas = 0;

  constructor(readonly nome: string) {}

  getName() {
    return this.nome;
  }

  getLastRow(): number {
    for (let i = this.linhas.length - 1; i >= 0; i -= 1) {
      if (this.linhas[i]?.some((celula) => celula !== '')) return i + 1;
    }
    return 0;
  }

  getLastColumn(): number {
    let maior = 0;
    for (const linha of this.linhas) {
      for (let j = linha.length - 1; j >= 0; j -= 1) {
        if (linha[j] !== '') {
          maior = Math.max(maior, j + 1);
          break;
        }
      }
    }
    return maior;
  }

  getRange(linha: number, coluna: number, numLinhas = 1, numColunas = 1) {
    return new FaixaFalsa(this, linha, coluna, numLinhas, numColunas);
  }

  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }

  getFrozenRows() {
    return this.congeladas;
  }

  setFrozenRows(n: number) {
    this.congeladas = n;
  }

  ler(linha: number, coluna: number): Celula {
    return this.linhas[linha - 1]?.[coluna - 1] ?? '';
  }

  gravar(linha: number, coluna: number, valor: Celula) {
    while (this.linhas.length < linha) this.linhas.push([]);
    const alvo = this.linhas[linha - 1]!;
    while (alvo.length < coluna) alvo.push('');
    alvo[coluna - 1] = valor;
  }
}

class FaixaFalsa {
  constructor(
    private readonly aba: AbaFalsa,
    private readonly linha: number,
    private readonly coluna: number,
    private readonly numLinhas: number,
    private readonly numColunas: number,
  ) {}

  getValues(): Celula[][] {
    return Array.from({ length: this.numLinhas }, (_, i) =>
      Array.from({ length: this.numColunas }, (_, j) => this.aba.ler(this.linha + i, this.coluna + j)),
    );
  }

  setValues(valores: unknown[][]) {
    if (valores.length !== this.numLinhas || valores.some((l) => l.length !== this.numColunas)) {
      throw new Error('setValues: dimensoes nao batem com a faixa');
    }
    valores.forEach((linha, i) =>
      linha.forEach((valor, j) =>
        this.aba.gravar(this.linha + i, this.coluna + j, comoAPlanilhaGuarda(valor)),
      ),
    );
    return this;
  }

  setValue(valor: unknown) {
    return this.setValues([[valor]]);
  }

  clearContent() {
    for (let i = 0; i < this.numLinhas; i += 1) {
      for (let j = 0; j < this.numColunas; j += 1) {
        this.aba.gravar(this.linha + i, this.coluna + j, '');
      }
    }
    return this;
  }
}

export class PlanilhaFalsa {
  abas = new Map<string, AbaFalsa>();

  getName() {
    return 'UNIVC Check-in (falsa)';
  }

  getSheetByName(nome: string) {
    return this.abas.get(nome) ?? null;
  }

  insertSheet(nome: string) {
    if (this.abas.has(nome)) throw new Error(`Aba ${nome} ja existe`);
    const aba = new AbaFalsa(nome);
    this.abas.set(nome, aba);
    return aba;
  }

  deleteSheet(aba: AbaFalsa) {
    this.abas.delete(aba.nome);
  }

  /** Valores crus de uma aba, como a planilha os guarda. */
  valores(nome: string): Celula[][] {
    return this.abas.get(nome)?.linhas.map((linha) => [...linha]) ?? [];
  }
}

export interface GoogleFalso {
  planilha: PlanilhaFalsa;
  propriedades: Map<string, string>;
  doPost(corpo: unknown): Record<string, unknown>;
  doGet(): Record<string, unknown>;
  executar(nome: string): unknown;
  /** fetch que entrega o POST ao doPost do Code.gs. */
  fetch: typeof fetch;
  logs: string[];
  chamadas: number;
}

export function criarGoogleFalso(chave?: string): GoogleFalso {
  const planilha = new PlanilhaFalsa();
  const propriedades = new Map<string, string>();
  if (chave) propriedades.set('CHAVE_API', chave);
  const logs: string[] = [];

  const contexto = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha, flush: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (nome: string) => propriedades.get(nome) ?? null,
        setProperty: (nome: string, valor: string) => propriedades.set(nome, valor),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (conteudo: string) => ({
        setMimeType() {
          return this;
        },
        getContent: () => conteudo,
      }),
    },
    Utilities: { getUuid: () => randomUUID() },
    Logger: { log: (mensagem: string) => logs.push(String(mensagem)) },
    JSON,
    Date,
    Math,
    String,
    Object,
    Array,
    Error,
  });
  vm.runInContext(readFileSync(caminhoCodeGs, 'utf8'), contexto, { filename: 'Code.gs' });

  const chamar = (nome: string, ...args: unknown[]) =>
    (contexto[nome] as (...a: unknown[]) => { getContent(): string })(...args);

  const google: GoogleFalso = {
    planilha,
    propriedades,
    logs,
    chamadas: 0,
    doPost: (corpo) =>
      JSON.parse(chamar('doPost', { postData: { contents: JSON.stringify(corpo) } }).getContent()),
    doGet: () => JSON.parse(chamar('doGet').getContent()),
    executar: (nome) => (contexto[nome] as () => unknown)(),
    fetch: (async (_url: unknown, init?: RequestInit) => {
      google.chamadas += 1;
      const saida = chamar('doPost', { postData: { contents: String(init?.body ?? '') } });
      return new Response(saida.getContent(), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  };
  return google;
}
