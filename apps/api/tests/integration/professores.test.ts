import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { gerarHashSenha } from '../../src/lib/senha.js';
import { prisma } from '../../src/prisma.js';

/**
 * CRUD de usuarios pelo RH (POST/PATCH/DELETE /admin/professores[/:id]) e dos
 * perfis que os classificam (/admin/perfis).
 *
 * Roda contra um Postgres real (DATABASE_URL_TEST), igual a
 * tests/integration/checkin.test.ts.
 */
const bancoDisponivel = await prisma
  .$connect()
  .then(() => true)
  .catch(() => false);

const PROFESSOR = {
  nome: 'Ana Beatriz Rocha',
  cpf: '11122233344',
  email: 'ana.rocha@univc.br',
  cursoVinculado: 'Direito',
  senha: 'senha123',
};

const ADMIN = { nome: 'RH Teste', email: 'rh@univc.br', senha: 'admin123' };

describe.skipIf(!bancoDisponivel)('cadastro de professores (CRUD do RH)', () => {
  let app: FastifyInstance;
  let professorId: string;
  let perfilProfessorId: string;
  let perfilEstagiarioId: string;

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
      'TRUNCATE TABLE "logs_auditoria", "refresh_tokens", "registros_ponto", "campi", "professores", "perfis", "admins" RESTART IDENTITY CASCADE',
    );

    perfilProfessorId = (
      await prisma.perfil.create({ data: { nome: 'Professor' } })
    ).id;
    perfilEstagiarioId = (
      await prisma.perfil.create({ data: { nome: 'Estagiário' } })
    ).id;

    const professor = await prisma.professor.create({
      data: {
        nome: PROFESSOR.nome,
        cpf: PROFESSOR.cpf,
        email: PROFESSOR.email,
        cursoVinculado: PROFESSOR.cursoVinculado,
        perfilId: perfilProfessorId,
        senhaHash: await gerarHashSenha(PROFESSOR.senha),
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

  async function logarProfessor(
    senha: string,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: PROFESSOR.email, senha },
    });
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

  function criar(
    tokenAdmin: string,
    corpo: Record<string, unknown>,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'POST',
      url: '/admin/professores',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: corpo,
    });
  }

  function editar(
    tokenAdmin: string,
    id: string,
    corpo: Record<string, unknown>,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'PATCH',
      url: `/admin/professores/${id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: corpo,
    });
  }

  function apagar(
    tokenAdmin: string,
    id: string,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'DELETE',
      url: `/admin/professores/${id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
  }

  const NOVO_PROFESSOR = {
    nome: 'Bruno Alves Teixeira',
    cpf: '99988877766',
    email: 'bruno.teixeira@univc.br',
    curso_vinculado: 'Engenharia Civil',
    // preenchido no beforeEach de cada teste (o id do perfil muda a cada banco limpo)
    perfil_id: '',
  };

  beforeEach(() => {
    NOVO_PROFESSOR.perfil_id = perfilProfessorId;
  });

  function comoAdmin(
    tokenAdmin: string,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: Record<string, unknown>,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      ...(payload ? { payload } : {}),
    });
  }

  it('RH cadastra um novo professor: devolve senha temporaria e exige troca no primeiro login', async () => {
    const tokenAdmin = await autenticarAdmin();

    const resposta = await criar(tokenAdmin, NOVO_PROFESSOR);
    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json();
    expect(corpo.professor.email).toBe(NOVO_PROFESSOR.email);
    expect(typeof corpo.senha_temporaria).toBe('string');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: NOVO_PROFESSOR.email, senha: corpo.senha_temporaria },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().usuario.deve_trocar_senha).toBe(true);
  });

  it('recusa cadastrar professor com email ja em uso', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await criar(tokenAdmin, {
      ...NOVO_PROFESSOR,
      email: PROFESSOR.email,
    });
    expect(resposta.statusCode).toBe(409);
  });

  it('recusa cadastrar professor com cpf ja em uso', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await criar(tokenAdmin, {
      ...NOVO_PROFESSOR,
      cpf: PROFESSOR.cpf,
    });
    expect(resposta.statusCode).toBe(409);
  });

  it('recusa cadastrar professor com cpf invalido', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await criar(tokenAdmin, { ...NOVO_PROFESSOR, cpf: '123' });
    expect(resposta.statusCode).toBe(400);
  });

  it('so admin pode cadastrar professor', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;
    const resposta = await criar(tokenProfessor, NOVO_PROFESSOR);
    expect(resposta.statusCode).toBe(403);
  });

  it('RH edita nome e curso de um professor', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await editar(tokenAdmin, professorId, {
      nome: 'Ana Beatriz Rocha Silva',
      curso_vinculado: 'Direito Empresarial',
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().professor.nome).toBe('Ana Beatriz Rocha Silva');

    const professor = await prisma.professor.findUniqueOrThrow({
      where: { id: professorId },
    });
    expect(professor.cursoVinculado).toBe('Direito Empresarial');
  });

  it('RH desativa um professor pela edicao', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await editar(tokenAdmin, professorId, { ativo: false });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().professor.ativo).toBe(false);
  });

  it('recusa editar para um email ja usado por outro professor', async () => {
    const tokenAdmin = await autenticarAdmin();
    await criar(tokenAdmin, NOVO_PROFESSOR);

    const resposta = await editar(tokenAdmin, professorId, {
      email: NOVO_PROFESSOR.email,
    });
    expect(resposta.statusCode).toBe(409);
  });

  it('404 ao editar professor inexistente', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await editar(
      tokenAdmin,
      '00000000-0000-0000-0000-000000000000',
      { nome: 'Qualquer' },
    );
    expect(resposta.statusCode).toBe(404);
  });

  it('RH apaga um professor definitivamente, removendo tambem os registros de ponto dele', async () => {
    await prisma.registroPonto.create({
      data: {
        professorId,
        tipo: 'CHEGADA',
        latitude: -18.7,
        longitude: -39.86,
        distanciaDoCampusMetros: 10,
        status: 'VALIDADO',
      },
    });

    const tokenAdmin = await autenticarAdmin();
    const resposta = await apagar(tokenAdmin, professorId);
    expect(resposta.statusCode).toBe(204);

    expect(await prisma.professor.findUnique({ where: { id: professorId } }))
      .toBeNull();
    expect(await prisma.registroPonto.count({ where: { professorId } })).toBe(
      0,
    );
  });

  it('so admin pode apagar professor', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;
    const resposta = await apagar(tokenProfessor, professorId);
    expect(resposta.statusCode).toBe(403);
  });

  it('404 ao apagar professor inexistente', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await apagar(
      tokenAdmin,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(resposta.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Perfis
  // -------------------------------------------------------------------------

  it('cadastra com o perfil escolhido e o login do usuario devolve o perfil', async () => {
    const tokenAdmin = await autenticarAdmin();

    const resposta = await criar(tokenAdmin, {
      ...NOVO_PROFESSOR,
      perfil_id: perfilEstagiarioId,
    });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().professor.perfil).toEqual({
      id: perfilEstagiarioId,
      nome: 'Estagiário',
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: NOVO_PROFESSOR.email,
        senha: resposta.json().senha_temporaria,
      },
    });
    expect(login.json().usuario.perfil).toBe('Estagiário');
  });

  it('a troca de senha obrigatoria devolve o usuario com o perfil', async () => {
    const tokenAdmin = await autenticarAdmin();
    const criado = await criar(tokenAdmin, {
      ...NOVO_PROFESSOR,
      perfil_id: perfilEstagiarioId,
    });
    const temporaria = criado.json().senha_temporaria as string;

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: NOVO_PROFESSOR.email, senha: temporaria },
    });

    const troca = await app.inject({
      method: 'PATCH',
      url: '/auth/senha',
      headers: { authorization: `Bearer ${login.json().access_token as string}` },
      payload: { senha_atual: temporaria, senha_nova: 'SenhaNova2026' },
    });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().usuario).toMatchObject({
      perfil: 'Estagiário',
      deve_trocar_senha: false,
    });
  });

  it('recusa cadastro sem perfil, com perfil inexistente ou desativado', async () => {
    const tokenAdmin = await autenticarAdmin();

    const { perfil_id: _, ...semPerfil } = NOVO_PROFESSOR;
    expect((await criar(tokenAdmin, semPerfil)).statusCode).toBe(400);

    const inexistente = await criar(tokenAdmin, {
      ...NOVO_PROFESSOR,
      perfil_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(inexistente.statusCode).toBe(400);

    await comoAdmin(tokenAdmin, 'PATCH', `/admin/perfis/${perfilEstagiarioId}`, {
      ativo: false,
    });
    const desativado = await criar(tokenAdmin, {
      ...NOVO_PROFESSOR,
      perfil_id: perfilEstagiarioId,
    });
    expect(desativado.statusCode).toBe(400);
  });

  it('RH troca o perfil de um usuario pela edicao', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await editar(tokenAdmin, professorId, {
      perfil_id: perfilEstagiarioId,
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().professor.perfil.nome).toBe('Estagiário');
  });

  it('cria e renomeia perfis, contando os usuarios de cada um', async () => {
    const tokenAdmin = await autenticarAdmin();

    const criado = await comoAdmin(tokenAdmin, 'POST', '/admin/perfis', {
      nome: 'Monitor',
      descricao: 'Aluno monitor de disciplina',
    });
    expect(criado.statusCode).toBe(201);
    const monitorId = criado.json().perfil.id as string;

    const duplicado = await comoAdmin(tokenAdmin, 'POST', '/admin/perfis', {
      nome: 'Monitor',
    });
    expect(duplicado.statusCode).toBe(409);

    await criar(tokenAdmin, { ...NOVO_PROFESSOR, perfil_id: monitorId });

    const renomeado = await comoAdmin(
      tokenAdmin,
      'PATCH',
      `/admin/perfis/${monitorId}`,
      { nome: 'Monitoria' },
    );
    expect(renomeado.statusCode).toBe(200);
    expect(renomeado.json().perfil).toMatchObject({
      nome: 'Monitoria',
      total_usuarios: 1,
    });

    const lista = await comoAdmin(tokenAdmin, 'GET', '/admin/professores');
    const bruno = lista
      .json()
      .dados.find((u: { email: string }) => u.email === NOVO_PROFESSOR.email);
    expect(bruno.perfil.nome).toBe('Monitoria');
  });

  it('filtra registros e jornada por perfil', async () => {
    const tokenAdmin = await autenticarAdmin();
    const estagiario = await prisma.professor.create({
      data: {
        nome: 'Lucas Dias',
        cpf: '66677788899',
        email: 'lucas.dias@univc.br',
        cursoVinculado: 'Sistemas',
        perfilId: perfilEstagiarioId,
        senhaHash: await gerarHashSenha('senha123'),
      },
    });
    for (const id of [professorId, estagiario.id]) {
      await prisma.registroPonto.create({
        data: {
          professorId: id,
          tipo: 'CHEGADA',
          latitude: -18.7,
          longitude: -39.86,
          distanciaDoCampusMetros: 10,
          status: 'VALIDADO',
        },
      });
    }

    const registros = await comoAdmin(
      tokenAdmin,
      'GET',
      `/admin/registros?perfil_id=${perfilEstagiarioId}`,
    );
    const dados = registros.json().dados as Array<{
      professor: { email: string; perfil: string };
    }>;
    expect(dados).toHaveLength(1);
    expect(dados[0]!.professor).toMatchObject({
      email: 'lucas.dias@univc.br',
      perfil: 'Estagiário',
    });

    const hoje = new Date().toISOString().slice(0, 10);
    const jornada = await comoAdmin(
      tokenAdmin,
      'GET',
      `/admin/relatorio-jornada?data_inicio=${hoje}&data_fim=${hoje}&perfil_id=${perfilEstagiarioId}`,
    );
    expect(jornada.json().professores).toHaveLength(1);
  });

  it('as rotas de perfis sao exclusivas do RH', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;
    expect(
      (await comoAdmin(tokenProfessor, 'GET', '/admin/perfis')).statusCode,
    ).toBe(403);
    expect(
      (
        await comoAdmin(tokenProfessor, 'POST', '/admin/perfis', {
          nome: 'Intruso',
        })
      ).statusCode,
    ).toBe(403);
  });
});
