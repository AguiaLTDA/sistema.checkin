import { describe, expect, it } from 'vitest';
import { ArmazenamentoAppsScript } from '../../src/dados/armazenamento.js';
import { Banco } from '../../src/dados/banco.js';
import { aplicarImportacao } from '../../scripts/importacao.js';
import { converterDump, desescaparCopy } from '../../scripts/supabase-dump.js';
import { criarGoogleFalso } from '../apoio/google-falso.js';

const CHAVE = 'k'.repeat(64);

/**
 * Dump sintetico no formato do pg_dumpall do Supabase, no schema anterior aos
 * perfis (como o backup real de 14/09). Valores ficticios.
 */
const DUMP = [
  'SET client_encoding = \'UTF8\';',
  'CREATE ROLE anon;',
  'COPY public._prisma_migrations (id, migration_name) FROM stdin;',
  'm1\t20260813202659_inicial',
  '\\.',
  'COPY public.admins (id, nome, email, senha_hash, ativo, created_at, updated_at) FROM stdin;',
  'a1\tRH UNIVC\trh@univc.br\t$2a$10$hashadmin\tt\t2026-09-06 18:30:00.123\t2026-09-06 18:30:00.123',
  '\\.',
  'COPY public.campi (id, nome, latitude_central, longitude_central, raio_permitido_metros, ativo, created_at, updated_at) FROM stdin;',
  'c1\tCampus Sao Mateus - UNIVC\t-18.7228125\t-39.8451875\t300\tt\t2026-09-06 18:30:00\t2026-09-06 18:30:00',
  '\\.',
  'COPY public.professores (id, nome, cpf, email, senha_hash, curso_vinculado, ativo, created_at, updated_at, deve_trocar_senha) FROM stdin;',
  'p1\tAna Beatriz\\tRocha\t01122233344\tana@univc.br\t$2a$10$hashprof\tDireito\tt\t2026-09-06 18:30:00\t2026-09-07 18:35:17.473\tf',
  '\\.',
  'COPY public.registros_ponto (id, professor_id, tipo, timestamp_servidor, latitude, longitude, distancia_do_campus_metros, precisao_metros, status, sincronizado_offline, registrado_offline_em, justificativa_manual, campus_id, decidido_por_id, decidido_em, created_at, updated_at) FROM stdin;',
  'r1\tp1\tCHEGADA\t2026-09-07 22:40:37.947\t-18.7\t-39.8\t3596.8\t\\N\tPENDENTE_APROVACAO\tf\t\\N\tlinha 1\\nlinha 2 com \\\\ barra\tc1\t\\N\t\\N\t2026-09-07 22:40:37.947\t2026-09-07 22:40:37.947',
  '\\.',
  'COPY public.refresh_tokens (id, token_hash, professor_id, admin_id, expira_em, revogado_em, created_at) FROM stdin;',
  '\\.',
  'COPY public.logs_auditoria (id, acao, resultado, professor_id, admin_id, registro_id, detalhes, ip, user_agent, criado_em) FROM stdin;',
  'l1\tTENTATIVA_CHECKIN\tREJEITADO\tp1\t\\N\tr1\t{"motivo": "FORA_DO_RAIO", "distancia_metros": 3597}\t10.0.0.1\tMozilla/5.0\t2026-09-07 23:14:01.143',
  '\\.',
].join('\n');

describe('leitura do backup do Supabase', () => {
  it('desfaz os escapes do COPY', () => {
    expect(desescaparCopy('\\N')).toBeNull();
    expect(desescaparCopy('a\\tb\\nc\\\\d')).toBe('a\tb\nc\\d');
    expect(desescaparCopy('Estagiário')).toBe('Estagiário');
  });

  it('converte tipos e aplica a migration dos perfis', () => {
    const { linhas, avisos, ignoradas } = converterDump(DUMP);

    expect(ignoradas).toEqual(['_prisma_migrations']);
    expect(linhas.perfil.map((p) => p.nome)).toEqual(['Professor', 'Estagiário', 'Estudante']);
    expect(avisos[0]).toMatch(/1 usuario\(s\) vinculados a "Professor"/);

    const [professor] = linhas.professor;
    expect(professor).toMatchObject({
      nome: 'Ana Beatriz\tRocha',
      cpf: '01122233344',
      ativo: true,
      deveTrocarSenha: false,
      perfilId: linhas.perfil[0]!.id,
    });
    expect(professor!.updatedAt).toEqual(new Date('2026-09-07T18:35:17.473Z'));

    const [registro] = linhas.registroPonto;
    expect(registro).toMatchObject({
      timestampServidor: new Date('2026-09-07T22:40:37.947Z'),
      distanciaDoCampusMetros: 3596.8,
      precisaoMetros: null,
      sincronizadoOffline: false,
      justificativaManual: 'linha 1\nlinha 2 com \\ barra',
    });

    expect(linhas.logAuditoria[0]!.detalhes).toEqual({
      motivo: 'FORA_DO_RAIO',
      distancia_metros: 3597,
    });
    expect(linhas.campus[0]!.raioPermitidoMetros).toBe(300);
  });

  it('aborta se o backup tiver coluna que a planilha nao tem', () => {
    const comColunaExtra = DUMP.replace(
      'COPY public.campi (id,',
      'COPY public.campi (coluna_nova, id,',
    ).replace('c1\tCampus', 'x\tc1\tCampus');
    expect(() => converterDump(comColunaExtra)).toThrow(/coluna_nova.*abortada/);
  });

  it('aborta com email repetido', () => {
    const duplicado = DUMP.replace(
      '\tDireito\tt\t2026-09-06 18:30:00\t2026-09-07 18:35:17.473\tf\n\\.',
      '\tDireito\tt\t2026-09-06 18:30:00\t2026-09-07 18:35:17.473\tf\n' +
        'p2\tOutra\t99988877766\tana@univc.br\th\tDireito\tt\t2026-09-06 18:30:00\t2026-09-06 18:30:00\tf\n\\.',
    );
    expect(() => converterDump(duplicado)).toThrow(/professores\.email/);
  });
});

describe('importacao para a planilha (Apps Script)', () => {
  const novaPlanilha = (fetchFn?: typeof fetch) => {
    const google = criarGoogleFalso(CHAVE);
    const criar = () =>
      new ArmazenamentoAppsScript('https://script.google.com/macros/s/x/exec', CHAVE, {
        fetch: fetchFn ?? google.fetch,
      });
    return { google, criar };
  };

  it('grava tudo pelo Code.gs e confere campo a campo', async () => {
    const { google, criar } = novaPlanilha();
    const dados = converterDump(DUMP);

    const { conferidas } = await aplicarImportacao(dados, criar, () => {});

    // 3 perfis + 1 admin + 1 campus + 1 professor + 1 registro + 1 log.
    expect(conferidas).toBe(8);
    expect(google.planilha.valores('professores')[1]?.[2]).toBe('01122233344');

    // A API, lendo a planilha depois, enxerga os dados importados.
    const banco = new Banco(criar(), { cacheMs: 0 });
    const professor = await banco.professor.findUniqueOrThrow({
      where: { email: 'ana@univc.br' },
      include: { perfil: true },
    });
    expect(professor.perfil?.nome).toBe('Professor');
  });

  it('nao grava nada se o autoteste da planilha falhar', async () => {
    const google = criarGoogleFalso(CHAVE);
    const fetchComAutotesteRuim: typeof fetch = async (url, init) => {
      if (String(init?.body).includes('"autoteste"')) {
        return new Response(JSON.stringify({ ok: true, aprovado: false, falhas: ['cpf virou numero'] }));
      }
      return google.fetch(url, init);
    };
    const criar = () =>
      new ArmazenamentoAppsScript('https://script.google.com/macros/s/x/exec', CHAVE, {
        fetch: fetchComAutotesteRuim,
      });

    await expect(aplicarImportacao(converterDump(DUMP), criar, () => {})).rejects.toThrow(
      /cpf virou numero/,
    );
    expect(google.planilha.abas.size).toBe(0);
  });

  it('recusa planilha que ja tem dados, sem gravar nada', async () => {
    const { google, criar } = novaPlanilha();
    await aplicarImportacao(converterDump(DUMP), criar, () => {});
    const antes = google.planilha.valores('registros_ponto').length;

    await expect(aplicarImportacao(converterDump(DUMP), criar, () => {})).rejects.toThrow(
      /ja tem .* linha\(s\)/,
    );
    expect(google.planilha.valores('registros_ponto')).toHaveLength(antes);
  });
});
