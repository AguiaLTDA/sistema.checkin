import { describe, expect, it } from 'vitest';
import { ArmazenamentoAppsScript } from '../../src/dados/armazenamento.js';
import { Banco } from '../../src/dados/banco.js';
import { cabecalhosPorAba } from '../../src/dados/esquema.js';
import { criarGoogleFalso } from '../apoio/google-falso.js';

const CHAVE = 'k'.repeat(64);

function pronto() {
  const google = criarGoogleFalso(CHAVE);
  const post = (corpo: Record<string, unknown>) => google.doPost({ chave: CHAVE, ...corpo });
  expect(post({ acao: 'preparar', esquema: cabecalhosPorAba() })).toEqual({ ok: true });
  return { google, post };
}

const registro = (id: string, extra: Record<string, string> = {}) => ({
  id,
  nome: 'Ana',
  cpf: '01122233344',
  email: `${id}@univc.br`,
  senha_hash: '$2a$10$abc',
  deve_trocar_senha: 'FALSE',
  curso_vinculado: 'Direito',
  perfil_id: '',
  ativo: 'TRUE',
  created_at: '2026-09-06T18:30:00.000Z',
  updated_at: '2026-09-06T18:30:00.000Z',
  ...extra,
});

describe('Code.gs: seguranca', () => {
  it('recusa tudo enquanto CHAVE_API nao estiver configurada', () => {
    const google = criarGoogleFalso();
    const resposta = google.doPost({ chave: CHAVE, acao: 'ping' });
    expect(resposta.ok).toBe(false);
    expect(String(resposta.erro)).toMatch(/CHAVE_API nao configurada/);
  });

  it('recusa chave errada, inclusive com mesmo tamanho', () => {
    const google = criarGoogleFalso(CHAVE);
    expect(google.doPost({ chave: 'x'.repeat(64), acao: 'ping' })).toEqual({
      ok: false,
      erro: 'Chave invalida.',
    });
    expect(google.doPost({ acao: 'ping' }).ok).toBe(false);
  });

  it('GET so diz que o servico esta no ar, sem dados', () => {
    expect(criarGoogleFalso(CHAVE).doGet()).toEqual({
      ok: true,
      servico: 'univc-checkin',
      versao: 1,
    });
  });

  it('configurarChave gera chave longa e a guarda nas propriedades', () => {
    const google = criarGoogleFalso();
    google.executar('configurarChave');
    const chave = google.propriedades.get('CHAVE_API');
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(google.doPost({ chave, acao: 'ping' })).toEqual({ ok: true, versao: 1 });
  });
});

describe('Code.gs: dados', () => {
  it('cria abas com cabecalho, de forma idempotente', () => {
    const { google, post } = pronto();
    post({ acao: 'preparar', esquema: cabecalhosPorAba() });

    expect(google.planilha.valores('professores')[0]).toEqual(cabecalhosPorAba().professores);
    expect(google.planilha.valores('professores')).toHaveLength(1);
  });

  it('acrescenta coluna nova sem mexer nas existentes', () => {
    const { google, post } = pronto();
    post({
      acao: 'escrever',
      operacoes: [{ tipo: 'inserir', aba: 'professores', registro: registro('p1') }],
    });

    const esquema = cabecalhosPorAba();
    esquema.professores = [...esquema.professores!, 'telefone'];
    post({ acao: 'preparar', esquema });

    const valores = google.planilha.valores('professores');
    expect(valores[0]?.at(-1)).toBe('telefone');
    expect(valores[1]?.[0]).toBe('p1');
  });

  it('grava e devolve texto que a planilha estragaria sem o apostrofo', () => {
    const { post } = pronto();
    const perigoso = registro('p1', {
      nome: '=IMPORTXML("http://malicioso","//a")',
      cpf: '01122233344',
      created_at: '2026-09-06T18:30:00.000Z',
    });
    post({
      acao: 'escrever',
      operacoes: [{ tipo: 'inserir', aba: 'professores', registro: perigoso }],
    });

    const lido = post({ acao: 'ler', abas: ['professores'] }) as {
      abas: Record<string, Record<string, unknown>[]>;
    };
    expect(lido.abas.professores?.[0]).toEqual(perigoso);
  });

  it('inserir o mesmo id duas vezes nao duplica (repeticao apos falha de rede)', () => {
    const { google, post } = pronto();
    const op = { tipo: 'inserir', aba: 'professores', registro: registro('p1') };
    post({ acao: 'escrever', operacoes: [op] });
    post({ acao: 'escrever', operacoes: [op] });
    expect(google.planilha.valores('professores')).toHaveLength(2);
  });

  it('valida o lote inteiro antes de escrever: nada fica pela metade', () => {
    const { google, post } = pronto();
    const resposta = post({
      acao: 'escrever',
      operacoes: [
        { tipo: 'inserir', aba: 'professores', registro: registro('p1') },
        { tipo: 'atualizar', aba: 'professores', id: 'nao-existe', campos: { nome: 'x' } },
      ],
    });
    expect(resposta.ok).toBe(false);
    expect(google.planilha.valores('professores')).toHaveLength(1);
  });

  it('atualiza so os campos enviados', () => {
    const { post } = pronto();
    post({
      acao: 'escrever',
      operacoes: [
        { tipo: 'inserir', aba: 'professores', registro: registro('p1') },
        { tipo: 'atualizar', aba: 'professores', id: 'p1', campos: { nome: 'Ana B.' } },
      ],
    });
    const lido = post({ acao: 'ler', abas: ['professores'] }) as {
      abas: Record<string, Record<string, unknown>[]>;
    };
    expect(lido.abas.professores?.[0]).toEqual(registro('p1', { nome: 'Ana B.' }));
  });

  it('remove em bloco e reaproveita as linhas livres', () => {
    const { google, post } = pronto();
    post({
      acao: 'escrever',
      operacoes: ['p1', 'p2', 'p3', 'p4'].map((id) => ({
        tipo: 'inserir',
        aba: 'professores',
        registro: registro(id),
      })),
    });
    post({
      acao: 'escrever',
      operacoes: [
        { tipo: 'remover', aba: 'professores', id: 'p2' },
        { tipo: 'remover', aba: 'professores', id: 'p3' },
        { tipo: 'remover', aba: 'professores', id: 'nao-existe' },
      ],
    });
    post({
      acao: 'escrever',
      operacoes: [{ tipo: 'inserir', aba: 'professores', registro: registro('p5') }],
    });

    const lido = post({ acao: 'ler', abas: ['professores'] }) as {
      abas: Record<string, Record<string, unknown>[]>;
    };
    expect(lido.abas.professores?.map((r) => r.id)).toEqual(['p1', 'p4', 'p5']);
    // CPF continua texto com zero depois da reescrita em bloco.
    expect(lido.abas.professores?.map((r) => r.cpf)).toEqual([
      '01122233344',
      '01122233344',
      '01122233344',
    ]);
    expect(google.planilha.abas.get('professores')?.getLastRow()).toBe(4);
  });

  it('autoteste de formatacao passa', () => {
    const { google, post } = pronto();
    expect(post({ acao: 'autoteste' })).toEqual({ ok: true, aprovado: true, falhas: [] });
    expect(google.planilha.getSheetByName('_autoteste')).toBeNull();
  });
});

describe('API -> Apps Script -> planilha (ponta a ponta)', () => {
  it('cria, rele por outra instancia, atualiza e remove em cascata', async () => {
    const google = criarGoogleFalso(CHAVE);
    const armazenamento = () =>
      new ArmazenamentoAppsScript('https://script.google.com/macros/s/x/exec', CHAVE, {
        fetch: google.fetch,
      });

    const banco = new Banco(armazenamento(), { cacheMs: 60_000 });
    await banco.iniciar();

    const perfil = await banco.perfil.create({ data: { nome: 'Estagiário' } });
    const professor = await banco.professor.create({
      data: {
        nome: 'Lucas',
        cpf: '06677788899',
        email: 'lucas@univc.br',
        senhaHash: '$2a$10$hash',
        cursoVinculado: 'ADS',
        perfilId: perfil.id,
      },
    });
    await banco.registroPonto.create({
      data: {
        professorId: professor.id,
        tipo: 'CHEGADA',
        latitude: -18.7228125,
        longitude: -39.8451875,
        distanciaDoCampusMetros: 0,
        status: 'VALIDADO',
      },
    });
    await banco.logAuditoria.create({
      data: {
        acao: 'TENTATIVA_CHECKIN',
        resultado: 'SUCESSO',
        professorId: professor.id,
        detalhes: { motivo: 'DENTRO_DO_RAIO', distancia_metros: 0 },
      },
    });

    // Outra instancia (como a API depois de reiniciar) le tudo igual.
    const relido = new Banco(armazenamento(), { cacheMs: 60_000 });
    const lido = await relido.professor.findUniqueOrThrow({
      where: { email: 'lucas@univc.br' },
      include: { perfil: true },
    });
    expect(lido.cpf).toBe('06677788899');
    expect(lido.perfil?.nome).toBe('Estagiário');
    const [registroLido] = await relido.registroPonto.findMany();
    expect(registroLido?.latitude).toBe(-18.7228125);
    const [logLido] = await relido.logAuditoria.findMany();
    expect(logLido?.detalhes).toEqual({ motivo: 'DENTRO_DO_RAIO', distancia_metros: 0 });

    await relido.professor.delete({ where: { id: professor.id } });

    const final = new Banco(armazenamento(), { cacheMs: 60_000 });
    expect(await final.professor.count()).toBe(0);
    expect(await final.registroPonto.count()).toBe(0);
    const [logFinal] = await final.logAuditoria.findMany();
    expect(logFinal?.professorId).toBeNull();
  });

  it('chave errada vira ErroArmazenamento com a mensagem do Apps Script', async () => {
    const google = criarGoogleFalso(CHAVE);
    const banco = new Banco(
      new ArmazenamentoAppsScript('https://script.google.com/macros/s/x/exec', 'y'.repeat(64), {
        fetch: google.fetch,
      }),
      { cacheMs: 0 },
    );
    await expect(banco.iniciar()).rejects.toThrow(/Chave invalida/);
  });

  it('repete a chamada quando a rede falha e nao duplica', async () => {
    const google = criarGoogleFalso(CHAVE);
    let falhas = 1;
    const fetchInstavel: typeof fetch = async (url, init) => {
      const resposta = await google.fetch(url, init);
      // Simula: a planilha gravou, mas a resposta se perdeu no caminho.
      if (falhas > 0) {
        falhas -= 1;
        throw new TypeError('fetch failed');
      }
      return resposta;
    };
    const banco = new Banco(
      new ArmazenamentoAppsScript('https://script.google.com/macros/s/x/exec', CHAVE, {
        fetch: fetchInstavel,
        esperaEntreTentativasMs: 0,
      }),
      { cacheMs: 60_000 },
    );
    await banco.campus.create({
      data: {
        nome: 'Campus Sao Mateus - UNIVC',
        latitudeCentral: -18.7228125,
        longitudeCentral: -39.8451875,
        raioPermitidoMetros: 300,
      },
    });
    expect(google.planilha.valores('campi')).toHaveLength(2);
  });
});
