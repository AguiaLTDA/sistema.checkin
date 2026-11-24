import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Onde as abas ficam guardadas de fato. A API conversa com este contrato e nao
 * sabe se do outro lado ha uma planilha do Google, um arquivo local ou memoria.
 *
 * Toda escrita e idempotente, para que uma chamada repetida depois de uma
 * falha de rede nao duplique nem estrague dados:
 *  - `inserir` com um id que ja existe e ignorado;
 *  - `remover` um id que nao existe nao faz nada;
 *  - `atualizar` apenas grava os campos informados (repetir da no mesmo).
 */

/** Linha como fica na planilha: cabecalho -> conteudo da celula. */
export type RegistroBruto = Record<string, unknown>;

export type OperacaoEscrita =
  | { tipo: 'inserir'; aba: string; registro: Record<string, string> }
  | { tipo: 'atualizar'; aba: string; id: string; campos: Record<string, string> }
  | { tipo: 'remover'; aba: string; id: string };

export interface Armazenamento {
  /** Descricao curta para logs (nunca inclui segredos). */
  readonly descricao: string;
  /**
   * true quando os dados podem mudar sem passar pela API (alguem editando a
   * planilha a mao). Liga a releitura periodica do cache.
   */
  readonly podeMudarPorFora: boolean;
  /** Cria abas e colunas que faltarem. Nunca apaga nada. Idempotente. */
  preparar(cabecalhos: Record<string, string[]>): Promise<void>;
  ler(abas: string[]): Promise<Record<string, RegistroBruto[]>>;
  /** Aplica as operacoes em ordem, num unico lote. */
  escrever(operacoes: OperacaoEscrita[]): Promise<void>;
}

/** O armazenamento nao respondeu ou recusou a operacao. */
export class ErroArmazenamento extends Error {
  constructor(mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = 'ErroArmazenamento';
  }
}

interface Aba {
  cabecalho: string[];
  linhas: Map<string, Record<string, string>>;
}

/** Armazenamento em memoria: testes e base do armazenamento em arquivo. */
export class ArmazenamentoMemoria implements Armazenamento {
  readonly descricao: string = 'memoria';
  readonly podeMudarPorFora: boolean = false;
  protected abas = new Map<string, Aba>();

  async preparar(cabecalhos: Record<string, string[]>): Promise<void> {
    for (const [nome, colunas] of Object.entries(cabecalhos)) {
      const aba: Aba = this.abas.get(nome) ?? { cabecalho: [], linhas: new Map() };
      for (const coluna of colunas) {
        if (!aba.cabecalho.includes(coluna)) aba.cabecalho.push(coluna);
      }
      this.abas.set(nome, aba);
    }
    this.aoAlterar();
  }

  async ler(abas: string[]): Promise<Record<string, RegistroBruto[]>> {
    return Object.fromEntries(
      abas.map((nome) => [
        nome,
        [...(this.abas.get(nome)?.linhas.values() ?? [])].map((linha) => ({ ...linha })),
      ]),
    );
  }

  async escrever(operacoes: OperacaoEscrita[]): Promise<void> {
    // Aplica sobre uma copia e so troca no fim: um erro no meio do lote nao
    // deixa a memoria pela metade.
    const copia = new Map(
      [...this.abas].map(([nome, aba]) => [
        nome,
        { cabecalho: aba.cabecalho, linhas: new Map(aba.linhas) },
      ]),
    );

    for (const operacao of operacoes) {
      const aba = copia.get(operacao.aba);
      if (!aba) throw new ErroArmazenamento(`Aba "${operacao.aba}" nao existe.`);

      if (operacao.tipo === 'inserir') {
        const id = operacao.registro.id;
        if (!id) throw new ErroArmazenamento(`Registro sem id na aba "${operacao.aba}".`);
        if (aba.linhas.has(id)) continue;
        exigirColunas(aba, Object.keys(operacao.registro), operacao.aba);
        aba.linhas.set(id, { ...operacao.registro });
      } else if (operacao.tipo === 'atualizar') {
        const atual = aba.linhas.get(operacao.id);
        if (!atual) {
          throw new ErroArmazenamento(
            `Registro "${operacao.id}" nao encontrado na aba "${operacao.aba}".`,
          );
        }
        exigirColunas(aba, Object.keys(operacao.campos), operacao.aba);
        aba.linhas.set(operacao.id, { ...atual, ...operacao.campos });
      } else {
        aba.linhas.delete(operacao.id);
      }
    }

    this.abas = copia;
    this.aoAlterar();
  }

  /** Apaga tudo. So existe aqui: nunca ha `limpar` na planilha de verdade. */
  limpar(): void {
    for (const aba of this.abas.values()) aba.linhas.clear();
    this.aoAlterar();
  }

  protected aoAlterar(): void {}
}

function exigirColunas(aba: Aba, colunas: string[], nome: string): void {
  const faltando = colunas.filter((coluna) => !aba.cabecalho.includes(coluna));
  if (faltando.length) {
    throw new ErroArmazenamento(`Colunas inexistentes na aba "${nome}": ${faltando.join(', ')}.`);
  }
}

interface ConteudoArquivo {
  versao: 1;
  abas: Record<string, { cabecalho: string[]; linhas: Record<string, string>[] }>;
}

/**
 * Armazenamento em arquivo JSON, para desenvolvimento local sem planilha.
 * Nao e para producao: o disco de servicos como o Render e apagado a cada deploy.
 */
export class ArmazenamentoArquivo extends ArmazenamentoMemoria {
  override readonly descricao: string;

  constructor(private readonly caminho: string) {
    super();
    this.descricao = `arquivo ${caminho}`;
    if (existsSync(caminho)) {
      const conteudo = JSON.parse(readFileSync(caminho, 'utf8')) as ConteudoArquivo;
      for (const [nome, aba] of Object.entries(conteudo.abas)) {
        this.abas.set(nome, {
          cabecalho: aba.cabecalho,
          linhas: new Map(aba.linhas.map((linha) => [linha.id ?? '', linha])),
        });
      }
    }
  }

  protected override aoAlterar(): void {
    const conteudo: ConteudoArquivo = {
      versao: 1,
      abas: Object.fromEntries(
        [...this.abas].map(([nome, aba]) => [
          nome,
          { cabecalho: aba.cabecalho, linhas: [...aba.linhas.values()] },
        ]),
      ),
    };
    mkdirSync(dirname(this.caminho), { recursive: true });
    // Grava num temporario e renomeia: um processo morto no meio da escrita
    // nao deixa o arquivo truncado.
    const temporario = `${this.caminho}.tmp`;
    writeFileSync(temporario, JSON.stringify(conteudo, null, 2));
    renameSync(temporario, this.caminho);
  }
}

type FuncaoFetch = typeof fetch;

/**
 * Planilha do Google, acessada pelo Web App do Apps Script em
 * `apps/apps-script/Code.gs`. Cada chamada e um POST com a chave secreta no
 * corpo; o Web App responde sempre `{ ok: true, ... }` ou `{ ok: false, erro }`.
 */
export class ArmazenamentoAppsScript implements Armazenamento {
  readonly descricao = 'planilha (Apps Script)';
  readonly podeMudarPorFora = true;

  constructor(
    private readonly url: string,
    private readonly chave: string,
    private readonly opcoes: {
      fetch?: FuncaoFetch;
      timeoutMs?: number;
      tentativas?: number;
      esperaEntreTentativasMs?: number;
    } = {},
  ) {}

  async preparar(cabecalhos: Record<string, string[]>): Promise<void> {
    await this.chamar({ acao: 'preparar', esquema: cabecalhos });
  }

  async ler(abas: string[]): Promise<Record<string, RegistroBruto[]>> {
    const resposta = await this.chamar({ acao: 'ler', abas });
    const lidas = resposta.abas as Record<string, RegistroBruto[]> | undefined;
    if (!lidas || typeof lidas !== 'object') {
      throw new ErroArmazenamento('Resposta do Apps Script sem o campo "abas".');
    }
    return Object.fromEntries(abas.map((aba) => [aba, lidas[aba] ?? []]));
  }

  async escrever(operacoes: OperacaoEscrita[]): Promise<void> {
    if (operacoes.length === 0) return;
    await this.chamar({ acao: 'escrever', operacoes });
  }

  /**
   * Pede ao Web App que grave e releia valores dificeis (CPF com zero na frente,
   * texto que parece formula, data ISO...) numa aba temporaria. Usado pelo
   * importador antes de gravar dados reais.
   */
  async autoteste(): Promise<{ aprovado: boolean; falhas: string[] }> {
    const resposta = await this.chamar({ acao: 'autoteste' });
    return {
      aprovado: resposta.aprovado === true,
      falhas: Array.isArray(resposta.falhas) ? (resposta.falhas as string[]) : [],
    };
  }

  private async chamar(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fetchFn = this.opcoes.fetch ?? fetch;
    const tentativas = this.opcoes.tentativas ?? 3;
    const espera = this.opcoes.esperaEntreTentativasMs ?? 1000;
    let ultimoErro: unknown;

    for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
      let resposta: Response;
      try {
        resposta = await fetchFn(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...corpo, chave: this.chave }),
          // O Web App responde com 302 para script.googleusercontent.com.
          redirect: 'follow',
          signal: AbortSignal.timeout(this.opcoes.timeoutMs ?? 60_000),
        });
      } catch (erro) {
        // Falha de rede ou timeout: como toda escrita e idempotente, repetir
        // e seguro.
        ultimoErro = erro;
        if (tentativa < tentativas) await dormir(espera * tentativa);
        continue;
      }

      if (resposta.status >= 500 || resposta.status === 429) {
        ultimoErro = new ErroArmazenamento(`Apps Script respondeu HTTP ${resposta.status}.`);
        if (tentativa < tentativas) await dormir(espera * tentativa);
        continue;
      }

      const texto = await resposta.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(texto) as Record<string, unknown>;
      } catch {
        throw new ErroArmazenamento(
          `Apps Script devolveu algo que nao e JSON (HTTP ${resposta.status}). ` +
            'Confira a APPS_SCRIPT_URL (deve terminar em /exec) e se o Web App foi ' +
            'implantado com acesso para "Qualquer pessoa".',
        );
      }

      if (json.ok !== true) {
        // Erro de regra (chave errada, aba inexistente...): repetir nao resolve.
        throw new ErroArmazenamento(
          `Apps Script recusou a operacao: ${String(json.erro ?? 'erro desconhecido')}`,
        );
      }
      return json;
    }

    throw new ErroArmazenamento('Nao foi possivel falar com o Apps Script.', {
      cause: ultimoErro,
    });
  }
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
