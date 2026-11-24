import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ErroArmazenamento,
  type Armazenamento,
  type OperacaoEscrita,
} from './armazenamento.js';
import {
  ErroDadosPlanilha,
  MODELOS,
  TABELAS,
  cabecalhosPorAba,
  codificar,
  planilhaParaLinha,
  type DefTabela,
  type NomeModelo,
} from './esquema.js';
import type {
  Admin,
  Campus,
  LogAuditoria,
  Perfil,
  Professor,
  RefreshToken,
  RegistroPonto,
} from './modelos.js';

/**
 * Camada de dados sobre a planilha.
 *
 * Os dados ficam numa copia em memoria (carregada aba por aba, sob demanda) e
 * toda escrita vai para a memoria E para o armazenamento antes de a operacao
 * terminar. As escritas passam por uma fila unica: muda a memoria, grava o
 * lote no armazenamento e, se a gravacao falhar, desfaz a mudanca na memoria.
 *
 * A interface (`banco.professor.findMany(...)` etc.) reproduz exatamente o
 * subconjunto do Prisma que as rotas usam, para a troca de banco nao mexer na
 * regra de negocio. Qualquer campo ou operador fora desse subconjunto gera
 * `ErroConsulta` em vez de ser ignorado em silencio.
 *
 * Premissa: uma unica instancia da API escreve na planilha (e o caso do Render
 * no plano atual). Duas instancias teriam caches independentes.
 */

type Linha = Record<string, unknown>;

/** Violacao de unicidade (o P2002 do Prisma). */
export class ErroUnicidade extends Error {
  constructor(
    readonly modelo: NomeModelo,
    readonly campo: string,
  ) {
    super(`Ja existe um registro em "${TABELAS[modelo].aba}" com o mesmo ${campo}.`);
    this.name = 'ErroUnicidade';
  }
}

/** update/delete/findUniqueOrThrow sem registro correspondente (o P2025). */
export class ErroRegistroInexistente extends Error {
  constructor(modelo: NomeModelo) {
    super(`Registro nao encontrado em "${TABELAS[modelo].aba}".`);
    this.name = 'ErroRegistroInexistente';
  }
}

/** Uso fora do subconjunto suportado: e bug de programacao, nao de dado. */
export class ErroConsulta extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConsulta';
  }
}

// ---------------------------------------------------------------------------
// Relacionamentos (o que o `include` e os filtros por relacao enxergam)
// ---------------------------------------------------------------------------

interface DefRelacao {
  modelo: NomeModelo;
  /** Campo da linha atual que guarda o id da linha relacionada. */
  chave: string;
}

const RELACOES: Record<NomeModelo, Record<string, DefRelacao>> = {
  registroPonto: {
    campus: { modelo: 'campus', chave: 'campusId' },
    professor: { modelo: 'professor', chave: 'professorId' },
  },
  professor: { perfil: { modelo: 'perfil', chave: 'perfilId' } },
  perfil: {},
  admin: {},
  campus: {},
  refreshToken: {},
  logAuditoria: {},
};

/** `_count` suportado: perfil -> quantos usuarios usam o perfil. */
const CONTAGENS: Partial<Record<NomeModelo, Record<string, DefRelacao>>> = {
  perfil: { usuarios: { modelo: 'professor', chave: 'perfilId' } },
};

/** As mesmas regras de ON DELETE do schema Postgres anterior. */
const AO_REMOVER: Partial<
  Record<NomeModelo, Array<{ modelo: NomeModelo; campo: string; acao: 'remover' | 'anular' }>>
> = {
  professor: [
    { modelo: 'registroPonto', campo: 'professorId', acao: 'remover' },
    { modelo: 'refreshToken', campo: 'professorId', acao: 'remover' },
    { modelo: 'logAuditoria', campo: 'professorId', acao: 'anular' },
  ],
  perfil: [{ modelo: 'professor', campo: 'perfilId', acao: 'anular' }],
  campus: [{ modelo: 'registroPonto', campo: 'campusId', acao: 'anular' }],
  admin: [
    { modelo: 'refreshToken', campo: 'adminId', acao: 'remover' },
    { modelo: 'registroPonto', campo: 'decididoPor', acao: 'anular' },
    { modelo: 'logAuditoria', campo: 'adminId', acao: 'anular' },
  ],
};

// ---------------------------------------------------------------------------
// Tipos publicos (formato dos argumentos, igual ao do Prisma)
// ---------------------------------------------------------------------------

type Filtro<T> =
  | T
  | null
  | {
      equals?: T | null;
      not?: T | null;
      in?: readonly T[];
      gte?: T;
      gt?: T;
      lte?: T;
      lt?: T;
    };

export type Onde<M> = { [K in keyof M]?: Filtro<M[K]> };
type Ordem<M> = { [K in keyof M]?: 'asc' | 'desc' };
type Inclusao = Record<string, unknown>;
type Dados<M> = { [K in keyof M]?: M[K] };

interface ArgsBusca<M, W> {
  where?: W;
  orderBy?: Ordem<M> | Ordem<M>[];
  skip?: number;
  take?: number;
  include?: Inclusao;
  /** Aceito por compatibilidade; a linha volta completa. */
  select?: Record<string, unknown>;
  distinct?: (keyof M & string)[];
}

export type RelProfessor = { perfil?: Perfil | null };
export type RelRegistro = {
  campus?: Campus | null;
  professor?: (Professor & RelProfessor) | null;
};
export type RelPerfil = { _count?: { usuarios: number } };
type OndeRegistro = Onde<RegistroPonto> & { professor?: Onde<Professor> };

export interface Delegado<M, R = object, W = Onde<M>> {
  findUnique(args: { where: W; include?: Inclusao; select?: Record<string, unknown> }): Promise<(M & R) | null>;
  findUniqueOrThrow(args: { where: W; include?: Inclusao; select?: Record<string, unknown> }): Promise<M & R>;
  findFirst(args?: ArgsBusca<M, W>): Promise<(M & R) | null>;
  findMany(args?: ArgsBusca<M, W>): Promise<(M & R)[]>;
  count(args?: { where?: W }): Promise<number>;
  create(args: { data: Dados<M>; include?: Inclusao }): Promise<M & R>;
  update(args: { where: W; data: Dados<M>; include?: Inclusao }): Promise<M & R>;
  updateMany(args: { where?: W; data: Dados<M> }): Promise<{ count: number }>;
  delete(args: { where: W }): Promise<M>;
  upsert(args: { where: W; create: Dados<M>; update: Dados<M>; include?: Inclusao }): Promise<M & R>;
}

export interface Delegados {
  professor: Delegado<Professor, RelProfessor>;
  perfil: Delegado<Perfil, RelPerfil>;
  admin: Delegado<Admin>;
  campus: Delegado<Campus>;
  registroPonto: Delegado<RegistroPonto, RelRegistro, OndeRegistro>;
  refreshToken: Delegado<RefreshToken>;
  logAuditoria: Delegado<LogAuditoria>;
}

// ---------------------------------------------------------------------------
// Lote de escrita: muda a memoria e guarda como desfazer
// ---------------------------------------------------------------------------

class Lote {
  readonly operacoes: OperacaoEscrita[] = [];
  private readonly desfazeres: Array<() => void> = [];

  constructor(private readonly motor: Motor) {}

  inserir(modelo: NomeModelo, linha: Linha): void {
    const tabela = TABELAS[modelo];
    const linhas = this.motor.tabelaSeCarregada(modelo);
    if (linhas) {
      this.exigirUnicos(tabela, linhas, linha);
      const id = linha.id as string;
      linhas.set(id, linha);
      this.desfazeres.push(() => linhas.delete(id));
    }
    // Aba ainda nao carregada (ex.: logs, que a API so grava): a linha vai
    // direto para o armazenamento e aparece quando a aba for lida.
    this.operacoes.push({
      tipo: 'inserir',
      aba: tabela.aba,
      registro: Object.fromEntries(
        tabela.colunas.map((coluna) => [coluna.coluna, codificar(linha[coluna.campo], coluna)]),
      ),
    });
  }

  atualizar(modelo: NomeModelo, id: string, mudancas: Linha): Linha {
    const tabela = TABELAS[modelo];
    const linhas = this.motor.tabela(modelo);
    const atual = linhas.get(id);
    if (!atual) throw new ErroRegistroInexistente(modelo);

    const novo = { ...atual, ...mudancas };
    this.exigirUnicos(tabela, linhas, novo);
    linhas.set(id, novo);
    this.desfazeres.push(() => linhas.set(id, atual));

    const campos: Record<string, string> = {};
    for (const coluna of tabela.colunas) {
      if (coluna.campo in mudancas) {
        campos[coluna.coluna] = codificar(mudancas[coluna.campo], coluna);
      }
    }
    this.operacoes.push({ tipo: 'atualizar', aba: tabela.aba, id, campos });
    return novo;
  }

  remover(modelo: NomeModelo, id: string): void {
    const linhas = this.motor.tabela(modelo);
    const atual = linhas.get(id);
    if (!atual) return;
    linhas.delete(id);
    this.desfazeres.push(() => linhas.set(id, atual));
    this.operacoes.push({ tipo: 'remover', aba: TABELAS[modelo].aba, id });
  }

  desfazer(): void {
    for (const desfazer of this.desfazeres.reverse()) desfazer();
    this.desfazeres.length = 0;
  }

  private exigirUnicos(tabela: DefTabela, linhas: Map<string, Linha>, linha: Linha): void {
    for (const campo of tabela.unicos) {
      const valor = linha[campo];
      if (valor === null || valor === undefined) continue;
      for (const outra of linhas.values()) {
        if (outra.id !== linha.id && igual(outra[campo], valor)) {
          throw new ErroUnicidade(tabela.modelo, campo);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Motor: cache, fila de escrita e avaliacao das consultas
// ---------------------------------------------------------------------------

interface EstadoTabela {
  linhas: Map<string, Linha>;
  carregadoEm: number;
}

/** Como uma operacao le e escreve: sozinha ou dentro de uma transacao. */
interface Contexto {
  garantir(modelos: Set<NomeModelo>): Promise<void>;
  escrever<T>(modelos: Set<NomeModelo>, operacao: (lote: Lote) => T): Promise<T>;
}

class Motor {
  private readonly estado = new Map<NomeModelo, EstadoTabela>();
  private preparado = false;
  private fila: Promise<void> = Promise.resolve();
  private readonly dentroDaFila = new AsyncLocalStorage<true>();

  constructor(
    readonly armazenamento: Armazenamento,
    private readonly ttlMs: number,
    private readonly aviso: (mensagem: string, erro: unknown) => void,
  ) {}

  tabelaSeCarregada(modelo: NomeModelo): Map<string, Linha> | undefined {
    return this.estado.get(modelo)?.linhas;
  }

  tabela(modelo: NomeModelo): Map<string, Linha> {
    const linhas = this.tabelaSeCarregada(modelo);
    if (!linhas) throw new ErroConsulta(`Aba de ${modelo} usada sem ter sido carregada.`);
    return linhas;
  }

  /** Executa com exclusividade: uma escrita (ou recarga) por vez. */
  async exclusivo<T>(operacao: () => Promise<T>): Promise<T> {
    if (this.dentroDaFila.getStore()) {
      throw new ErroConsulta(
        'Operacao do banco chamada dentro de $transaction sem usar o `tx` recebido.',
      );
    }
    const anterior = this.fila;
    let liberar!: () => void;
    this.fila = new Promise((resolve) => {
      liberar = resolve;
    });
    await anterior;
    try {
      return await this.dentroDaFila.run(true, operacao);
    } finally {
      liberar();
    }
  }

  private precisaCarregar(modelo: NomeModelo): boolean {
    const atual = this.estado.get(modelo);
    if (!atual) return true;
    return (
      this.armazenamento.podeMudarPorFora && Date.now() - atual.carregadoEm >= this.ttlMs
    );
  }

  /**
   * Garante as abas em memoria; usado fora da fila (leituras soltas).
   *
   * Se a releitura periodica falhar (Apps Script fora do ar por instantes) e
   * todas as abas ja tiverem uma copia, a leitura segue com a copia atual em
   * vez de derrubar a requisicao. Escritas continuam exigindo a planilha.
   */
  async garantir(modelos: Set<NomeModelo>): Promise<void> {
    if (![...modelos].some((modelo) => this.precisaCarregar(modelo))) return;
    await this.exclusivo(async () => {
      try {
        await this.carregar(modelos);
      } catch (erro) {
        const temCopia = [...modelos].every((modelo) => this.estado.has(modelo));
        if (!(erro instanceof ErroArmazenamento) || !temCopia) throw erro;
        this.aviso('releitura da planilha falhou; usando a copia em memoria', erro);
        const agora = Date.now();
        for (const modelo of modelos) {
          const atual = this.estado.get(modelo);
          if (atual) atual.carregadoEm = agora;
        }
      }
    });
  }

  /** Le do armazenamento as abas faltando ou vencidas. Chamar dentro da fila. */
  async carregar(modelos: Set<NomeModelo>, forcar = false): Promise<void> {
    if (!this.preparado) {
      await this.armazenamento.preparar(cabecalhosPorAba());
      this.preparado = true;
    }

    const alvos = [...modelos].filter((modelo) => forcar || this.precisaCarregar(modelo));
    if (alvos.length === 0) return;

    const lidas = await this.armazenamento.ler(alvos.map((modelo) => TABELAS[modelo].aba));
    const agora = Date.now();

    // Decodifica tudo antes de trocar o cache: um erro de dado nao deixa a
    // memoria com metade das abas novas.
    const novas = alvos.map((modelo) => {
      const tabela = TABELAS[modelo];
      const linhas = new Map<string, Linha>();
      for (const bruto of lidas[tabela.aba] ?? []) {
        const id = bruto.id;
        if (id === undefined || id === null || id === '') continue; // linha em branco
        if (linhas.has(String(id))) {
          throw new ErroDadosPlanilha(tabela.aba, 'id', String(id), 'id repetido');
        }
        linhas.set(String(id), planilhaParaLinha(tabela, bruto));
      }
      return [modelo, linhas] as const;
    });

    for (const [modelo, linhas] of novas) {
      this.estado.set(modelo, { linhas, carregadoEm: agora });
    }
  }

  /** Depois de uma falha de gravacao, a planilha pode divergir: rele tudo. */
  invalidar(): void {
    this.estado.clear();
  }

  readonly contextoAvulso: Contexto = {
    garantir: (modelos) => this.garantir(modelos),
    escrever: (modelos, operacao) =>
      this.exclusivo(async () => {
        await this.carregar(modelos);
        const lote = new Lote(this);
        try {
          const resultado = operacao(lote);
          await this.armazenamento.escrever(lote.operacoes);
          return resultado;
        } catch (erro) {
          lote.desfazer();
          if (erro instanceof ErroArmazenamento) this.invalidar();
          throw erro;
        }
      }),
  };

  async transacao<T>(executar: (contexto: Contexto) => Promise<T>): Promise<T> {
    return this.exclusivo(async () => {
      const lote = new Lote(this);
      const contexto: Contexto = {
        // Ja estamos dentro da fila: carrega direto, sem pedir a vez de novo.
        garantir: (modelos) => this.carregar(modelos),
        escrever: async (modelos, operacao) => {
          await this.carregar(modelos);
          return operacao(lote);
        },
      };
      try {
        const resultado = await executar(contexto);
        await this.armazenamento.escrever(lote.operacoes);
        return resultado;
      } catch (erro) {
        lote.desfazer();
        if (erro instanceof ErroArmazenamento) this.invalidar();
        throw erro;
      }
    });
  }

  // ---- avaliacao de consultas (sincrona, sobre o cache) -------------------

  casa(modelo: NomeModelo, linha: Linha, onde: Record<string, unknown> | undefined): boolean {
    for (const [chave, criterio] of Object.entries(onde ?? {})) {
      if (criterio === undefined) continue;

      const relacao = RELACOES[modelo][chave];
      if (relacao) {
        const idAlvo = linha[relacao.chave];
        const alvo =
          typeof idAlvo === 'string' ? this.tabela(relacao.modelo).get(idAlvo) : undefined;
        if (!alvo || !this.casa(relacao.modelo, alvo, criterio as Record<string, unknown>)) {
          return false;
        }
        continue;
      }

      exigirCampo(modelo, chave);
      if (!casaCampo(linha[chave], criterio)) return false;
    }
    return true;
  }

  montar(modelo: NomeModelo, linha: Linha, inclusao: Inclusao | undefined): Linha {
    const copia = structuredClone(linha);
    for (const [chave, pedido] of Object.entries(inclusao ?? {})) {
      if (!pedido) continue;

      const relacao = RELACOES[modelo][chave];
      if (relacao) {
        const idAlvo = linha[relacao.chave];
        const alvo =
          typeof idAlvo === 'string' ? this.tabela(relacao.modelo).get(idAlvo) : undefined;
        const aninhada =
          typeof pedido === 'object' ? (pedido as { include?: Inclusao }).include : undefined;
        copia[chave] = alvo ? this.montar(relacao.modelo, alvo, aninhada) : null;
        continue;
      }

      if (chave === '_count') {
        const selecao = (pedido as { select?: Record<string, unknown> }).select ?? {};
        const contagem: Record<string, number> = {};
        for (const nome of Object.keys(selecao)) {
          const def = CONTAGENS[modelo]?.[nome];
          if (!def) throw new ErroConsulta(`_count.${nome} nao suportado em ${modelo}.`);
          let total = 0;
          for (const outra of this.tabela(def.modelo).values()) {
            if (outra[def.chave] === linha.id) total += 1;
          }
          contagem[nome] = total;
        }
        copia._count = contagem;
        continue;
      }

      throw new ErroConsulta(`include.${chave} nao suportado em ${modelo}.`);
    }
    return copia;
  }

  /** Valida campos e operadores do filtro mesmo com a aba vazia. */
  validarOnde(modelo: NomeModelo, onde: Record<string, unknown> | undefined): void {
    for (const [chave, criterio] of Object.entries(onde ?? {})) {
      if (criterio === undefined) continue;
      const relacao = RELACOES[modelo][chave];
      if (relacao) {
        this.validarOnde(relacao.modelo, criterio as Record<string, unknown>);
        continue;
      }
      exigirCampo(modelo, chave);
      if (eOperador(criterio)) {
        for (const operador of Object.keys(criterio)) {
          if (!OPERADORES.has(operador)) {
            throw new ErroConsulta(`Operador "${operador}" nao suportado.`);
          }
        }
      }
    }
  }

  buscar(modelo: NomeModelo, args: ArgsBusca<Linha, Record<string, unknown>>): Linha[] {
    this.validarOnde(modelo, args.where);
    let linhas = [...this.tabela(modelo).values()]
      .map((linha, ordem) => ({ linha, ordem }))
      .filter(({ linha }) => this.casa(modelo, linha, args.where));

    const criterios = normalizarOrdem(modelo, args.orderBy);
    if (criterios.length) {
      // Empate em todos os criterios: mantem a ordem de insercao, invertida
      // quando o primeiro criterio e decrescente ("mais recente primeiro").
      const desempate = criterios[0]?.[1] === 'desc' ? -1 : 1;
      linhas.sort((a, b) => {
        for (const [campo, direcao] of criterios) {
          const resultado = compararOrdem(a.linha[campo], b.linha[campo], direcao);
          if (resultado !== 0) return resultado;
        }
        return (a.ordem - b.ordem) * desempate;
      });
    }

    if (args.distinct?.length) {
      const vistos = new Set<string>();
      linhas = linhas.filter(({ linha }) => {
        const chave = JSON.stringify(args.distinct!.map((campo) => linha[campo]));
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
    }

    const inicio = args.skip ?? 0;
    const fim = args.take === undefined ? undefined : inicio + args.take;
    return linhas.slice(inicio, fim).map(({ linha }) => linha);
  }

  /** Abas que uma consulta precisa: a propria, relacoes filtradas e incluidas. */
  modelosDaConsulta(
    modelo: NomeModelo,
    onde?: Record<string, unknown>,
    inclusao?: Inclusao,
    acumulado = new Set<NomeModelo>(),
  ): Set<NomeModelo> {
    acumulado.add(modelo);
    for (const [chave, criterio] of Object.entries(onde ?? {})) {
      const relacao = RELACOES[modelo][chave];
      if (relacao && criterio !== undefined) {
        this.modelosDaConsulta(relacao.modelo, criterio as Record<string, unknown>, undefined, acumulado);
      }
    }
    for (const [chave, pedido] of Object.entries(inclusao ?? {})) {
      if (!pedido) continue;
      const relacao = RELACOES[modelo][chave];
      if (relacao) {
        const aninhada =
          typeof pedido === 'object' ? (pedido as { include?: Inclusao }).include : undefined;
        this.modelosDaConsulta(relacao.modelo, undefined, aninhada, acumulado);
      } else if (chave === '_count') {
        for (const def of Object.values(CONTAGENS[modelo] ?? {})) acumulado.add(def.modelo);
      }
    }
    return acumulado;
  }

  /** Abas tocadas pela remocao em cascata de um modelo. */
  modelosDaRemocao(modelo: NomeModelo, acumulado = new Set<NomeModelo>()): Set<NomeModelo> {
    if (acumulado.has(modelo)) return acumulado;
    acumulado.add(modelo);
    for (const regra of AO_REMOVER[modelo] ?? []) {
      if (regra.acao === 'remover') this.modelosDaRemocao(regra.modelo, acumulado);
      else acumulado.add(regra.modelo);
    }
    return acumulado;
  }

  removerEmCascata(lote: Lote, modelo: NomeModelo, id: string): void {
    for (const regra of AO_REMOVER[modelo] ?? []) {
      const dependentes = [...this.tabela(regra.modelo).values()].filter(
        (linha) => linha[regra.campo] === id,
      );
      for (const dependente of dependentes) {
        const idDependente = dependente.id as string;
        if (regra.acao === 'remover') this.removerEmCascata(lote, regra.modelo, idDependente);
        else lote.atualizar(regra.modelo, idDependente, { [regra.campo]: null });
      }
    }
    lote.remover(modelo, id);
  }
}

// ---------------------------------------------------------------------------
// Delegado: a API estilo Prisma de um modelo
// ---------------------------------------------------------------------------

class DelegadoModelo {
  constructor(
    private readonly motor: Motor,
    private readonly contexto: Contexto,
    private readonly modelo: NomeModelo,
  ) {}

  private get tabelaDef(): DefTabela {
    return TABELAS[this.modelo];
  }

  async findMany(args: ArgsBusca<Linha, Record<string, unknown>> = {}): Promise<Linha[]> {
    await this.contexto.garantir(
      this.motor.modelosDaConsulta(this.modelo, args.where, args.include),
    );
    return this.motor
      .buscar(this.modelo, args)
      .map((linha) => this.motor.montar(this.modelo, linha, args.include));
  }

  async findFirst(args: ArgsBusca<Linha, Record<string, unknown>> = {}): Promise<Linha | null> {
    const [primeira] = await this.findMany({ ...args, take: 1 });
    return primeira ?? null;
  }

  async findUnique(args: { where: Record<string, unknown>; include?: Inclusao }): Promise<Linha | null> {
    return this.findFirst({ where: args.where, include: args.include });
  }

  async findUniqueOrThrow(args: { where: Record<string, unknown>; include?: Inclusao }): Promise<Linha> {
    const linha = await this.findUnique(args);
    if (!linha) throw new ErroRegistroInexistente(this.modelo);
    return linha;
  }

  async count(args: { where?: Record<string, unknown> } = {}): Promise<number> {
    await this.contexto.garantir(this.motor.modelosDaConsulta(this.modelo, args.where));
    return this.motor.buscar(this.modelo, { where: args.where }).length;
  }

  async create(args: { data: Linha; include?: Inclusao }): Promise<Linha> {
    const linha = this.paraCriacao(args.data);
    const modelos = this.motor.modelosDaConsulta(this.modelo, undefined, args.include);
    // Sem unicidade para checar, a aba nao precisa estar em memoria.
    if (this.tabelaDef.unicos.length === 0) modelos.delete(this.modelo);
    return this.contexto.escrever(modelos, (lote) => {
      lote.inserir(this.modelo, linha);
      return this.motor.montar(this.modelo, linha, args.include);
    });
  }

  async update(args: { where: Record<string, unknown>; data: Linha; include?: Inclusao }): Promise<Linha> {
    const mudancas = this.paraAtualizacao(args.data);
    const modelos = this.motor.modelosDaConsulta(this.modelo, args.where, args.include);
    return this.contexto.escrever(modelos, (lote) => {
      const alvo = this.unico(args.where);
      const novo = lote.atualizar(this.modelo, alvo.id as string, mudancas);
      return this.motor.montar(this.modelo, novo, args.include);
    });
  }

  async updateMany(args: { where?: Record<string, unknown>; data: Linha }): Promise<{ count: number }> {
    const mudancas = this.paraAtualizacao(args.data);
    const modelos = this.motor.modelosDaConsulta(this.modelo, args.where);
    return this.contexto.escrever(modelos, (lote) => {
      const alvos = this.motor.buscar(this.modelo, { where: args.where });
      for (const alvo of alvos) lote.atualizar(this.modelo, alvo.id as string, mudancas);
      return { count: alvos.length };
    });
  }

  async delete(args: { where: Record<string, unknown> }): Promise<Linha> {
    const modelos = this.motor.modelosDaRemocao(this.modelo);
    this.motor.modelosDaConsulta(this.modelo, args.where, undefined, modelos);
    return this.contexto.escrever(modelos, (lote) => {
      const alvo = this.unico(args.where);
      this.motor.removerEmCascata(lote, this.modelo, alvo.id as string);
      return structuredClone(alvo);
    });
  }

  async upsert(args: {
    where: Record<string, unknown>;
    create: Linha;
    update: Linha;
    include?: Inclusao;
  }): Promise<Linha> {
    const nova = this.paraCriacao(args.create);
    const mudancas = this.paraAtualizacao(args.update);
    const modelos = this.motor.modelosDaConsulta(this.modelo, args.where, args.include);
    return this.contexto.escrever(modelos, (lote) => {
      const [existente] = this.motor.buscar(this.modelo, { where: args.where, take: 1 });
      if (existente) {
        const novo = lote.atualizar(this.modelo, existente.id as string, mudancas);
        return this.motor.montar(this.modelo, novo, args.include);
      }
      lote.inserir(this.modelo, nova);
      return this.motor.montar(this.modelo, nova, args.include);
    });
  }

  private unico(onde: Record<string, unknown>): Linha {
    const encontrados = this.motor.buscar(this.modelo, { where: onde, take: 2 });
    if (encontrados.length === 0) throw new ErroRegistroInexistente(this.modelo);
    if (encontrados.length > 1) {
      throw new ErroConsulta(`Filtro de ${this.modelo} deveria identificar um unico registro.`);
    }
    return encontrados[0]!;
  }

  private paraCriacao(dados: Linha): Linha {
    this.exigirCamposConhecidos(dados);
    const linha: Linha = {};
    for (const coluna of this.tabelaDef.colunas) {
      let valor = dados[coluna.campo];
      if (valor === undefined) {
        if (coluna.padrao) valor = coluna.padrao();
        else if (coluna.nulo) valor = null;
        else {
          throw new ErroConsulta(`Campo obrigatorio "${coluna.campo}" ausente em ${this.modelo}.`);
        }
      }
      linha[coluna.campo] = normalizar(valor, coluna.tipo);
    }
    return linha;
  }

  private paraAtualizacao(dados: Linha): Linha {
    this.exigirCamposConhecidos(dados);
    if ('id' in dados && dados.id !== undefined) {
      throw new ErroConsulta(`O id de ${this.modelo} nao pode ser alterado.`);
    }
    const mudancas: Linha = {};
    for (const coluna of this.tabelaDef.colunas) {
      const valor = dados[coluna.campo];
      if (valor !== undefined) mudancas[coluna.campo] = normalizar(valor, coluna.tipo);
    }
    if (this.tabelaDef.temUpdatedAt && dados.updatedAt === undefined) {
      mudancas.updatedAt = new Date();
    }
    return mudancas;
  }

  private exigirCamposConhecidos(dados: Linha): void {
    for (const campo of Object.keys(dados)) exigirCampo(this.modelo, campo);
  }
}

// ---------------------------------------------------------------------------
// Banco: ponto de entrada usado pelas rotas
// ---------------------------------------------------------------------------

export class Banco implements Delegados {
  readonly professor!: Delegados['professor'];
  readonly perfil!: Delegados['perfil'];
  readonly admin!: Delegados['admin'];
  readonly campus!: Delegados['campus'];
  readonly registroPonto!: Delegados['registroPonto'];
  readonly refreshToken!: Delegados['refreshToken'];
  readonly logAuditoria!: Delegados['logAuditoria'];

  private readonly motor: Motor;

  constructor(
    readonly armazenamento: Armazenamento,
    opcoes: { cacheMs: number; aviso?: (mensagem: string, erro: unknown) => void },
  ) {
    this.motor = new Motor(
      armazenamento,
      opcoes.cacheMs,
      opcoes.aviso ?? ((mensagem, erro) => console.warn(`[banco] ${mensagem}:`, erro)),
    );
    Object.assign(this, criarDelegados(this.motor, this.motor.contextoAvulso));
  }

  /** Prepara as abas e carrega as pequenas; falha cedo se a planilha nao responde. */
  async iniciar(): Promise<void> {
    await this.motor.exclusivo(() =>
      this.motor.carregar(new Set<NomeModelo>(['professor', 'perfil', 'admin', 'campus'])),
    );
  }

  /**
   * Varias escritas num unico lote: ou todas vao para a planilha, ou nenhuma
   * fica na memoria. Use o `tx` recebido (nao o `banco`) dentro da funcao.
   */
  $transaction<T>(executar: (tx: Delegados) => Promise<T>): Promise<T> {
    return this.motor.transacao((contexto) => executar(criarDelegados(this.motor, contexto)));
  }

  /** Esvazia tudo. So permitido em armazenamento que nao e a planilha real. */
  async $limpar(): Promise<void> {
    const armazenamento = this.armazenamento as { limpar?: () => void };
    if (typeof armazenamento.limpar !== 'function') {
      throw new Error(`$limpar nao e permitido em ${this.armazenamento.descricao}.`);
    }
    await this.motor.exclusivo(async () => {
      armazenamento.limpar!();
      this.motor.invalidar();
    });
  }

  /** Descarta o cache: a proxima leitura busca tudo de novo no armazenamento. */
  async $recarregar(): Promise<void> {
    await this.motor.exclusivo(async () => this.motor.invalidar());
  }
}

function criarDelegados(motor: Motor, contexto: Contexto): Delegados {
  const delegados = Object.fromEntries(
    MODELOS.map((modelo) => [modelo, new DelegadoModelo(motor, contexto, modelo)]),
  );
  // O DelegadoModelo trabalha com linhas genericas; a tipagem de cada modelo
  // fica na interface `Delegados`, que e o que as rotas enxergam.
  return delegados as unknown as Delegados;
}

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------

function exigirCampo(modelo: NomeModelo, campo: string): void {
  if (!TABELAS[modelo].colunas.some((coluna) => coluna.campo === campo)) {
    throw new ErroConsulta(`Campo "${campo}" nao existe em ${modelo}.`);
  }
}

function eOperador(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !(valor instanceof Date) && !Array.isArray(valor);
}

const OPERADORES = new Set(['equals', 'not', 'in', 'gte', 'gt', 'lte', 'lt']);

function casaCampo(valor: unknown, criterio: unknown): boolean {
  if (criterio === null) return valor === null;
  if (!eOperador(criterio)) return igual(valor, criterio);

  for (const [operador, alvo] of Object.entries(criterio)) {
    if (alvo === undefined) continue;
    if (!OPERADORES.has(operador)) throw new ErroConsulta(`Operador "${operador}" nao suportado.`);
    switch (operador) {
      case 'equals':
        if (!(alvo === null ? valor === null : igual(valor, alvo))) return false;
        break;
      case 'not':
        if (alvo === null ? valor === null : igual(valor, alvo)) return false;
        break;
      case 'in':
        if (!(alvo as unknown[]).some((item) => igual(valor, item))) return false;
        break;
      default: {
        const comparacao = comparar(valor, alvo);
        if (comparacao === null) return false;
        if (operador === 'gte' && !(comparacao >= 0)) return false;
        if (operador === 'gt' && !(comparacao > 0)) return false;
        if (operador === 'lte' && !(comparacao <= 0)) return false;
        if (operador === 'lt' && !(comparacao < 0)) return false;
      }
    }
  }
  return true;
}

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** <0, 0, >0, ou null quando nao da para comparar (algum lado nulo). */
function comparar(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'pt-BR');
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  throw new ErroConsulta('Comparacao entre tipos diferentes.');
}

/** Ordenacao como no Postgres: nulos por ultimo no asc, primeiro no desc. */
function compararOrdem(a: unknown, b: unknown, direcao: 'asc' | 'desc'): number {
  const aNulo = a === null || a === undefined;
  const bNulo = b === null || b === undefined;
  if (aNulo || bNulo) {
    if (aNulo && bNulo) return 0;
    const nuloDepois = aNulo ? 1 : -1;
    return direcao === 'asc' ? nuloDepois : -nuloDepois;
  }
  const resultado = comparar(a, b) ?? 0;
  return direcao === 'asc' ? resultado : -resultado;
}

function normalizarOrdem(
  modelo: NomeModelo,
  ordem: Record<string, unknown> | Record<string, unknown>[] | undefined,
): Array<[string, 'asc' | 'desc']> {
  if (!ordem) return [];
  const lista = Array.isArray(ordem) ? ordem : [ordem];
  return lista.flatMap((item) =>
    Object.entries(item).map(([campo, direcao]) => {
      exigirCampo(modelo, campo);
      if (direcao !== 'asc' && direcao !== 'desc') {
        throw new ErroConsulta(`Direcao de ordenacao invalida para ${campo}.`);
      }
      return [campo, direcao] as [string, 'asc' | 'desc'];
    }),
  );
}

/** Garante o tipo em memoria (ex.: data recebida como texto ISO vira Date). */
function normalizar(valor: unknown, tipo: string): unknown {
  if (valor === null) return null;
  if (tipo === 'data' && !(valor instanceof Date)) {
    const data = new Date(String(valor));
    if (Number.isNaN(data.getTime())) throw new ErroConsulta(`Data invalida: ${String(valor)}`);
    return data;
  }
  return valor;
}
