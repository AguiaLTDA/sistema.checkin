import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { gerarHashSenha } from '../../src/lib/senha.js';
import { prisma } from '../../src/prisma.js';

/**
 * Teste de integracao do fluxo completo de check-in: login -> POST /checkin ->
 * persistencia -> historico -> aprovacao manual pelo RH.
 *
 * Roda contra um Postgres real (DATABASE_URL_TEST). Se o banco nao estiver
 * disponivel a suite se marca como pulada, para nao quebrar `npm test` em uma
 * maquina sem Docker ligado.
 */
const bancoDisponivel = await prisma
  .$connect()
  .then(() => true)
  .catch(() => {
    console.warn(
      '[testes] Postgres indisponivel: pulando a integracao. Suba com `docker compose up -d db`.',
    );
    return false;
  });

const CAMPUS = {
  nome: 'Campus de Teste',
  latitudeCentral: -18.70046,
  longitudeCentral: -39.86322,
  raioPermitidoMetros: 300,
};

/** ~111 m ao norte do centro: dentro dos 300 m permitidos. */
const DENTRO_DO_RAIO = { latitude: -18.69946, longitude: -39.86322 };
/** ~1,7 km ao sul do centro: fora do raio. */
const FORA_DO_RAIO = { latitude: -18.716, longitude: -39.86322 };

const PROFESSOR = {
  nome: 'Ana Beatriz Rocha',
  cpf: '11122233344',
  email: 'ana.rocha@univc.br',
  cursoVinculado: 'Direito',
  senha: 'senha123',
};

const ADMIN = { nome: 'RH Teste', email: 'rh@univc.br', senha: 'admin123' };

describe.skipIf(!bancoDisponivel)('fluxo completo de check-in', () => {
  let app: FastifyInstance;
  let professorId: string;
  let campusId: string;

  beforeAll(async () => {
    app = await construirApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "logs_auditoria", "refresh_tokens", "registros_ponto", "campi", "professores", "admins" RESTART IDENTITY CASCADE',
    );

    const campus = await prisma.campus.create({ data: CAMPUS });
    campusId = campus.id;

    const senhaHash = await gerarHashSenha(PROFESSOR.senha);
    const professor = await prisma.professor.create({
      data: {
        nome: PROFESSOR.nome,
        cpf: PROFESSOR.cpf,
        email: PROFESSOR.email,
        cursoVinculado: PROFESSOR.cursoVinculado,
        senhaHash,
      },
    });
    professorId = professor.id;

    await prisma.admin.create({
      data: {
        nome: ADMIN.nome,
        email: ADMIN.email,
        senhaHash: await gerarHashSenha(ADMIN.senha),
      },
    });
  });

  async function autenticarProfessor(): Promise<string> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: PROFESSOR.email, senha: PROFESSOR.senha },
    });

    expect(resposta.statusCode).toBe(200);
    return resposta.json().access_token as string;
  }

  async function autenticarAdmin(): Promise<string> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/admin/login',
      payload: { email: ADMIN.email, senha: ADMIN.senha },
    });

    expect(resposta.statusCode).toBe(200);
    return resposta.json().access_token as string;
  }

  function checkin(
    token: string,
    payload: Record<string, unknown>,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'POST',
      url: '/checkin',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  it('valida a chegada de um professor dentro do raio do campus', async () => {
    const token = await autenticarProfessor();
    const antes = Date.now();

    const resposta = await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json();

    expect(corpo.registro.status).toBe('VALIDADO');
    expect(corpo.registro.tipo).toBe('CHEGADA');
    expect(corpo.registro.dentro_do_raio).toBe(true);
    // O DTO nao carrega nenhum campo de biometria: a presenca e so localizacao.
    expect(corpo.registro).not.toHaveProperty('metodo_biometrico');
    expect(corpo.registro.campus.id).toBe(campusId);
    expect(corpo.registro.distancia_do_campus_metros).toBeLessThan(300);
    expect(corpo.motivo).toBe('DENTRO_DO_RAIO');

    // O horario e do servidor: fica entre o instante anterior a chamada e agora.
    const timestamp = new Date(corpo.registro.timestamp_servidor).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(antes - 1_000);
    expect(timestamp).toBeLessThanOrEqual(Date.now() + 1_000);

    const salvo = await prisma.registroPonto.findUniqueOrThrow({
      where: { id: corpo.registro.id },
    });
    expect(salvo.professorId).toBe(professorId);
    expect(salvo.status).toBe('VALIDADO');
    expect(salvo.campusId).toBe(campusId);
  });

  it('ignora qualquer horario enviado pelo cliente', async () => {
    const token = await autenticarProfessor();
    const horarioForjado = '2020-01-01T03:00:00.000Z';

    const resposta = await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
      timestamp: horarioForjado,
      timestamp_servidor: horarioForjado,
      created_at: horarioForjado,
    });

    expect(resposta.statusCode).toBe(201);
    const timestamp = new Date(
      resposta.json().registro.timestamp_servidor,
    ).getTime();

    expect(timestamp).not.toBe(new Date(horarioForjado).getTime());
    expect(timestamp).toBeGreaterThan(Date.now() - 60_000);
  });

  it('ignora campo de biometria enviado por um cliente antigo', async () => {
    const token = await autenticarProfessor();

    const resposta = await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
      metodo_biometrico: 'FACE_ID',
    });

    // Um app desatualizado continua funcionando: a chave desconhecida e
    // descartada pelo zod e o registro e validado so pela localizacao.
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().registro.status).toBe('VALIDADO');
    expect(resposta.json().motivo).toBe('DENTRO_DO_RAIO');
    expect(resposta.json().registro).not.toHaveProperty('metodo_biometrico');
  });

  it('recusa check-in sem latitude e longitude', async () => {
    const token = await autenticarProfessor();

    const resposta = await checkin(token, { tipo: 'CHEGADA' });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().detalhes.map((d: { campo: string }) => d.campo)).toEqual(
      expect.arrayContaining(['latitude', 'longitude']),
    );
    expect(await prisma.registroPonto.count()).toBe(0);
  });

  it('manda para aprovacao do RH um registro fora do raio', async () => {
    const token = await autenticarProfessor();

    const resposta = await checkin(token, {
      tipo: 'CHEGADA',
      ...FORA_DO_RAIO,
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json();
    expect(corpo.registro.status).toBe('PENDENTE_APROVACAO');
    expect(corpo.registro.dentro_do_raio).toBe(false);
    expect(corpo.registro.distancia_do_campus_metros).toBeGreaterThan(300);
    expect(corpo.motivo).toBe('FORA_DO_RAIO');
  });

  it('aceita registro da fila offline guardando o horario declarado a parte', async () => {
    const token = await autenticarProfessor();
    const declarado = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const resposta = await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
      sincronizado_offline: true,
      registrado_offline_em: declarado,
    });

    expect(resposta.statusCode).toBe(201);
    const registro = resposta.json().registro;

    expect(registro.sincronizado_offline).toBe(true);
    expect(registro.status).toBe('PENDENTE_APROVACAO');
    expect(new Date(registro.registrado_offline_em).toISOString()).toBe(declarado);
    // O horario oficial continua sendo o do servidor, nao o declarado.
    expect(registro.timestamp_servidor).not.toBe(declarado);
  });

  it('recusa duas chegadas seguidas sem saida no meio', async () => {
    const token = await autenticarProfessor();

    const primeira = await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });
    expect(primeira.statusCode).toBe(201);

    const segunda = await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe('CONFLITO');
    expect(segunda.json().detalhes.proximo_tipo_esperado).toBe('SAIDA');
    expect(await prisma.registroPonto.count()).toBe(1);
  });

  it('completa chegada e saida e devolve os dois no historico', async () => {
    const token = await autenticarProfessor();

    await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });
    const saida = await checkin(token, {
      tipo: 'SAIDA',
      ...DENTRO_DO_RAIO,
    });
    expect(saida.statusCode).toBe(201);

    const historico = await app.inject({
      method: 'GET',
      url: '/checkin/historico',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(historico.statusCode).toBe(200);
    const corpo = historico.json();
    expect(corpo.paginacao.total).toBe(2);
    // Ordenado do mais recente para o mais antigo.
    expect(corpo.dados[0].tipo).toBe('SAIDA');
    expect(corpo.dados[1].tipo).toBe('CHEGADA');

    const ultimo = await app.inject({
      method: 'GET',
      url: '/checkin/ultimo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ultimo.json().proximo_tipo_esperado).toBe('CHEGADA');
  });

  it('grava auditoria da tentativa aceita e da rejeitada', async () => {
    const token = await autenticarProfessor();

    await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });
    await checkin(token, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });

    const logs = await prisma.logAuditoria.findMany({
      where: { acao: 'TENTATIVA_CHECKIN' },
      orderBy: { criadoEm: 'asc' },
    });

    expect(logs).toHaveLength(2);
    expect(logs[0]?.resultado).toBe('SUCESSO');
    expect(logs[1]?.resultado).toBe('REJEITADO');
    expect((logs[1]?.detalhes as Record<string, unknown>).motivo).toBe(
      'SEQUENCIA_INVALIDA',
    );
  });

  it('recusa check-in sem token', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/checkin',
      payload: {
        tipo: 'CHEGADA',
        ...DENTRO_DO_RAIO,
      },
    });

    expect(resposta.statusCode).toBe(401);
    expect(await prisma.registroPonto.count()).toBe(0);
  });

  it('recusa payload invalido com detalhes por campo', async () => {
    const token = await autenticarProfessor();

    const resposta = await checkin(token, {
      tipo: 'ALMOCO',
      latitude: 999,
    });

    expect(resposta.statusCode).toBe(400);
    const corpo = resposta.json();
    expect(corpo.erro).toBe('VALIDACAO');
    expect(corpo.detalhes.map((d: { campo: string }) => d.campo)).toEqual(
      expect.arrayContaining(['tipo', 'latitude', 'longitude']),
    );
    expect(await prisma.registroPonto.count()).toBe(0);
  });

  it('recusa login com senha errada', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: PROFESSOR.email, senha: 'senha-errada' },
    });

    expect(resposta.statusCode).toBe(401);
    const logs = await prisma.logAuditoria.findMany({
      where: { acao: 'LOGIN_FALHA' },
    });
    expect(logs).toHaveLength(1);
  });

  it('deixa o RH aprovar manualmente um registro pendente', async () => {
    const tokenProfessor = await autenticarProfessor();
    const pendente = await checkin(tokenProfessor, {
      tipo: 'CHEGADA',
      ...FORA_DO_RAIO,
    });
    const registroId = pendente.json().registro.id as string;

    const tokenAdmin = await autenticarAdmin();

    // Sem justificativa a aprovacao e recusada.
    const semJustificativa = await app.inject({
      method: 'PATCH',
      url: `/admin/registros/${registroId}/aprovar`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: {},
    });
    expect(semJustificativa.statusCode).toBe(400);

    const aprovacao = await app.inject({
      method: 'PATCH',
      url: `/admin/registros/${registroId}/aprovar`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: {
        justificativa_manual:
          'Professora ministrou aula no anexo do forum, fora da geocerca.',
      },
    });

    expect(aprovacao.statusCode).toBe(200);
    expect(aprovacao.json().registro.status).toBe('VALIDADO');
    expect(aprovacao.json().registro.justificativa_manual).toContain('forum');

    const salvo = await prisma.registroPonto.findUniqueOrThrow({
      where: { id: registroId },
    });
    expect(salvo.status).toBe('VALIDADO');
    expect(salvo.decididoPor).not.toBeNull();
    expect(salvo.decididoEm).not.toBeNull();
  });

  it('impede que um professor acesse as rotas de admin', async () => {
    const token = await autenticarProfessor();

    const resposta = await app.inject({
      method: 'GET',
      url: '/admin/registros',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('monta o relatorio de jornada com horas e inconsistencia', async () => {
    const tokenProfessor = await autenticarProfessor();
    await checkin(tokenProfessor, {
      tipo: 'CHEGADA',
      ...DENTRO_DO_RAIO,
    });

    const tokenAdmin = await autenticarAdmin();
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const resposta = await app.inject({
      method: 'GET',
      url: `/admin/relatorio-jornada?data_inicio=${hoje}&data_fim=${hoje}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });

    expect(resposta.statusCode).toBe(200);
    const relatorio = resposta.json();
    const linha = relatorio.professores.find(
      (p: { professor: { id: string } }) => p.professor.id === professorId,
    );

    expect(linha).toBeDefined();
    expect(linha.total_inconsistencias).toBeGreaterThan(0);
    expect(linha.dias[0].inconsistencias.map((i: { tipo: string }) => i.tipo)).toContain(
      'CHEGADA_SEM_SAIDA',
    );
  });
});
