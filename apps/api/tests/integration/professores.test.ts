import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { gerarHashSenha } from '../../src/lib/senha.js';
import { prisma } from '../../src/prisma.js';

/**
 * CRUD de professores pelo RH (POST/PATCH/DELETE /admin/professores[/:id]).
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

    const professor = await prisma.professor.create({
      data: {
        nome: PROFESSOR.nome,
        cpf: PROFESSOR.cpf,
        email: PROFESSOR.email,
        cursoVinculado: PROFESSOR.cursoVinculado,
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
  };

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
});
