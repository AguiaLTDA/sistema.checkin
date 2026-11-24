import { describe, expect, it } from 'vitest';
import {
  ArmazenamentoAppsScript,
  ArmazenamentoMemoria,
  ErroArmazenamento,
  type OperacaoEscrita,
  type RegistroBruto,
} from '../../src/dados/armazenamento.js';
import {
  Banco,
  ErroConsulta,
  ErroRegistroInexistente,
  ErroUnicidade,
} from '../../src/dados/banco.js';
import {
  ErroDadosPlanilha,
  TABELAS,
  codificar,
  decodificar,
} from '../../src/dados/esquema.js';

/** Memoria que simula uma planilha: pode mudar por fora e pode falhar. */
class ArmazenamentoInstavel extends ArmazenamentoMemoria {
  override readonly podeMudarPorFora = true;
  falharEscrita = false;
  falharLeitura = false;
  escritas = 0;

  override async escrever(operacoes: OperacaoEscrita[]): Promise<void> {
    if (this.falharEscrita) throw new ErroArmazenamento('planilha fora do ar');
    this.escritas += 1;
    return super.escrever(operacoes);
  }

  override async ler(abas: string[]): Promise<Record<string, RegistroBruto[]>> {
    if (this.falharLeitura) throw new ErroArmazenamento('planilha fora do ar');
    return super.ler(abas);
  }
}

function novoBanco(cacheMs = 60_000) {
  const armazenamento = new ArmazenamentoInstavel();
  const banco = new Banco(armazenamento, { cacheMs, aviso: () => {} });
  return { banco, armazenamento };
}

const professorBase = {
  nome: 'Ana Beatriz Rocha',
  cpf: '01122233344',
  email: 'ana.rocha@univc.br',
  senhaHash: 'hash',
  cursoVinculado: 'Direito',
};

describe('codificacao das celulas', () => {
  const coluna = (modelo: keyof typeof TABELAS, campo: string) =>
    TABELAS[modelo].colunas.find((c) => c.campo === campo)!;

  it('preserva o zero inicial do CPF mesmo se a planilha virou numero', () => {
    const cpf = coluna('professor', 'cpf');
    expect(decodificar('01122233344', cpf, 'professores', 'x')).toBe('01122233344');
    expect(decodificar(1122233344, cpf, 'professores', 'x')).toBe('01122233344');
  });

  it('le booleanos em ingles, em portugues e nativos', () => {
    const ativo = coluna('professor', 'ativo');
    expect(decodificar('TRUE', ativo, 'professores', 'x')).toBe(true);
    expect(decodificar('VERDADEIRO', ativo, 'professores', 'x')).toBe(true);
    expect(decodificar('FALSO', ativo, 'professores', 'x')).toBe(false);
    expect(decodificar(false, ativo, 'professores', 'x')).toBe(false);
  });

  it('faz ida e volta de data, numero e json sem perda', () => {
    const data = new Date('2026-09-07T22:40:37.947Z');
    const ts = coluna('registroPonto', 'timestampServidor');
    expect(decodificar(codificar(data, ts), ts, 'registros_ponto', 'x')).toEqual(data);

    const lat = coluna('registroPonto', 'latitude');
    expect(decodificar(codificar(-18.7228125, lat), lat, 'registros_ponto', 'x')).toBe(-18.7228125);
    expect(decodificar('-18,5', lat, 'registros_ponto', 'x')).toBe(-18.5);

    const detalhes = coluna('logAuditoria', 'detalhes');
    const objeto = { motivo: 'FORA_DO_RAIO', distancia_metros: 2059 };
    expect(decodificar(codificar(objeto, detalhes), detalhes, 'logs_auditoria', 'x')).toEqual(objeto);
  });

  it('recusa valor fora do enum e celula vazia em coluna obrigatoria', () => {
    expect(() =>
      decodificar('ALMOCO', coluna('registroPonto', 'tipo'), 'registros_ponto', 'r1'),
    ).toThrow(ErroDadosPlanilha);
    expect(() => decodificar('', coluna('professor', 'email'), 'professores', 'p1')).toThrow(
      /coluna "email".*celula vazia/,
    );
  });

  it('aceita vazio como nulo em coluna opcional', () => {
    expect(decodificar('', coluna('professor', 'perfilId'), 'professores', 'p1')).toBeNull();
  });
});

describe('Banco sobre a planilha', () => {
  it('grava com valores padrao e outra instancia le exatamente o mesmo', async () => {
    const { banco, armazenamento } = novoBanco();
    const criado = await banco.professor.create({ data: professorBase });

    expect(criado.ativo).toBe(true);
    expect(criado.deveTrocarSenha).toBe(false);
    expect(criado.perfilId).toBeNull();
    expect(criado.createdAt).toBeInstanceOf(Date);

    const outro = new Banco(armazenamento, { cacheMs: 60_000 });
    expect(await outro.professor.findUnique({ where: { id: criado.id } })).toEqual(criado);
  });

  it('recusa email repetido sem gravar nada', async () => {
    const { banco, armazenamento } = novoBanco();
    await banco.professor.create({ data: professorBase });
    const escritasAntes = armazenamento.escritas;

    await expect(
      banco.professor.create({ data: { ...professorBase, cpf: '99999999999' } }),
    ).rejects.toThrow(ErroUnicidade);

    expect(armazenamento.escritas).toBe(escritasAntes);
    expect(await banco.professor.count()).toBe(1);
  });

  it('desfaz a mudanca em memoria quando a planilha falha', async () => {
    const { banco, armazenamento } = novoBanco();
    await banco.professor.count();
    armazenamento.falharEscrita = true;

    await expect(banco.professor.create({ data: professorBase })).rejects.toThrow(
      ErroArmazenamento,
    );

    armazenamento.falharEscrita = false;
    expect(await banco.professor.count()).toBe(0);
    // E volta a funcionar quando a planilha volta.
    await banco.professor.create({ data: professorBase });
    expect(await banco.professor.count()).toBe(1);
  });

  it('transacao grava tudo junto ou nada', async () => {
    const { banco, armazenamento } = novoBanco();
    const professor = await banco.professor.create({ data: professorBase });
    await banco.refreshToken.create({
      data: { tokenHash: 'h1', professorId: professor.id, expiraEm: new Date('2030-01-01') },
    });

    armazenamento.falharEscrita = true;
    await expect(
      banco.$transaction(async (tx) => {
        await tx.professor.update({ where: { id: professor.id }, data: { deveTrocarSenha: true } });
        await tx.refreshToken.updateMany({
          where: { professorId: professor.id, revogadoEm: null },
          data: { revogadoEm: new Date() },
        });
      }),
    ).rejects.toThrow(ErroArmazenamento);
    armazenamento.falharEscrita = false;

    const depois = await banco.professor.findUniqueOrThrow({ where: { id: professor.id } });
    expect(depois.deveTrocarSenha).toBe(false);
    expect(await banco.refreshToken.count({ where: { revogadoEm: null } })).toBe(1);

    const escritasAntes = armazenamento.escritas;
    await banco.$transaction(async (tx) => {
      await tx.professor.update({ where: { id: professor.id }, data: { deveTrocarSenha: true } });
      await tx.refreshToken.updateMany({
        where: { professorId: professor.id, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
    });
    // Um unico lote para as duas mudancas.
    expect(armazenamento.escritas).toBe(escritasAntes + 1);
    expect(await banco.refreshToken.count({ where: { revogadoEm: null } })).toBe(0);
  });

  it('impede usar o banco (em vez do tx) dentro da transacao', async () => {
    const { banco } = novoBanco();
    await expect(
      banco.$transaction(async () => {
        await banco.professor.create({ data: professorBase });
      }),
    ).rejects.toThrow(ErroConsulta);
  });

  it('remove professor em cascata como o schema antigo', async () => {
    const { banco } = novoBanco();
    const professor = await banco.professor.create({ data: professorBase });
    const outro = await banco.professor.create({
      data: { ...professorBase, cpf: '55566677788', email: 'outro@univc.br' },
    });
    const registro = {
      tipo: 'CHEGADA' as const,
      latitude: -18.72,
      longitude: -39.84,
      distanciaDoCampusMetros: 10,
      status: 'VALIDADO' as const,
    };
    await banco.registroPonto.create({ data: { ...registro, professorId: professor.id } });
    await banco.registroPonto.create({ data: { ...registro, professorId: outro.id } });
    await banco.refreshToken.create({
      data: { tokenHash: 'h1', professorId: professor.id, expiraEm: new Date('2030-01-01') },
    });
    const log = await banco.logAuditoria.create({
      data: { acao: 'LOGIN_SUCESSO', resultado: 'SUCESSO', professorId: professor.id },
    });

    await banco.professor.delete({ where: { id: professor.id } });

    expect(await banco.registroPonto.count({ where: { professorId: professor.id } })).toBe(0);
    expect(await banco.registroPonto.count({ where: { professorId: outro.id } })).toBe(1);
    expect(await banco.refreshToken.count()).toBe(0);
    const logDepois = await banco.logAuditoria.findUniqueOrThrow({ where: { id: log.id } });
    expect(logDepois.professorId).toBeNull();
  });

  it('avalia filtros, relacoes, ordenacao, paginacao e contagem', async () => {
    const { banco } = novoBanco();
    const perfil = await banco.perfil.create({ data: { nome: 'Professor' } });
    const direito = await banco.professor.create({
      data: { ...professorBase, perfilId: perfil.id },
    });
    const enfermagem = await banco.professor.create({
      data: {
        ...professorBase,
        cpf: '33344455566',
        email: 'mariana@univc.br',
        cursoVinculado: 'Enfermagem',
      },
    });

    const base = {
      latitude: -18.72,
      longitude: -39.84,
      distanciaDoCampusMetros: 10,
      status: 'VALIDADO' as const,
    };
    for (const [professorId, hora, tipo] of [
      [direito.id, '08:00', 'CHEGADA'],
      [direito.id, '12:00', 'SAIDA'],
      [enfermagem.id, '09:00', 'CHEGADA'],
    ] as const) {
      await banco.registroPonto.create({
        data: { ...base, professorId, tipo, timestampServidor: new Date(`2026-09-03T${hora}:00Z`) },
      });
    }

    const doDireito = await banco.registroPonto.findMany({
      where: { professor: { cursoVinculado: { equals: 'Direito' } } },
      orderBy: { timestampServidor: 'desc' },
      include: { professor: { include: { perfil: true } } },
    });
    expect(doDireito.map((r) => r.tipo)).toEqual(['SAIDA', 'CHEGADA']);
    expect(doDireito[0]?.professor?.perfil?.nome).toBe('Professor');

    const janela = await banco.registroPonto.findMany({
      where: {
        timestampServidor: {
          gte: new Date('2026-09-03T08:30:00Z'),
          lt: new Date('2026-09-03T12:00:00Z'),
        },
      },
    });
    expect(janela).toHaveLength(1);
    expect(janela[0]?.professorId).toBe(enfermagem.id);

    expect(
      await banco.registroPonto.count({
        where: { professorId: { in: [direito.id] }, status: { not: 'REJEITADO' } },
      }),
    ).toBe(2);

    const pagina = await banco.registroPonto.findMany({
      orderBy: { timestampServidor: 'asc' },
      skip: 1,
      take: 1,
    });
    expect(pagina[0]?.timestampServidor.toISOString()).toBe('2026-09-03T09:00:00.000Z');

    const cursos = await banco.professor.findMany({
      distinct: ['cursoVinculado'],
      orderBy: { cursoVinculado: 'asc' },
    });
    expect(cursos.map((c) => c.cursoVinculado)).toEqual(['Direito', 'Enfermagem']);

    const [comContagem] = await banco.perfil.findMany({
      include: { _count: { select: { usuarios: true } } },
    });
    expect(comContagem?._count?.usuarios).toBe(1);
  });

  it('acusa campo inexistente em vez de ignorar o filtro', async () => {
    const { banco } = novoBanco();
    await expect(
      banco.professor.findMany({ where: { emial: 'x' } as never }),
    ).rejects.toThrow(ErroConsulta);
  });

  it('update de registro inexistente da 404 (ErroRegistroInexistente)', async () => {
    const { banco } = novoBanco();
    await expect(
      banco.professor.update({ where: { id: 'nao-existe' }, data: { nome: 'x' } }),
    ).rejects.toThrow(ErroRegistroInexistente);
  });

  it('rele a planilha depois do prazo e enxerga edicao feita a mao', async () => {
    const { banco, armazenamento } = novoBanco(0);
    const criado = await banco.professor.create({ data: professorBase });

    // RH corrige o nome direto na planilha.
    await ArmazenamentoMemoria.prototype.escrever.call(armazenamento, [
      { tipo: 'atualizar', aba: 'professores', id: criado.id, campos: { nome: 'Ana B. Rocha' } },
    ]);

    const lido = await banco.professor.findUniqueOrThrow({ where: { id: criado.id } });
    expect(lido.nome).toBe('Ana B. Rocha');
  });

  it('segue com a copia em memoria se a releitura falhar', async () => {
    const { banco, armazenamento } = novoBanco(0);
    await banco.professor.create({ data: professorBase });
    await banco.professor.count();

    armazenamento.falharLeitura = true;
    expect(await banco.professor.count()).toBe(1);
  });

  it('nao deixa limpar a planilha de verdade', async () => {
    const banco = new Banco(new ArmazenamentoAppsScript('https://exemplo.invalid/exec', 'x'.repeat(40)), {
      cacheMs: 0,
    });
    await expect(banco.$limpar()).rejects.toThrow(/nao e permitido/);
  });
});
