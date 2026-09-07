import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { gerarHashSenha } from '../../src/lib/senha.js';
import { prisma } from '../../src/prisma.js';

/**
 * Redefinicao de senha pelo RH (PATCH /admin/professores/:id/redefinir-senha)
 * e troca de senha pelo proprio professor (PATCH /auth/senha).
 *
 * Roda contra um Postgres real (DATABASE_URL_TEST), igual a
 * tests/integration/checkin.test.ts. Se o banco nao estiver disponivel a
 * suite se marca como pulada.
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

describe.skipIf(!bancoDisponivel)('redefinicao e troca de senha', () => {
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

  function redefinirSenha(
    tokenAdmin: string,
    id: string,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'PATCH',
      url: `/admin/professores/${id}/redefinir-senha`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
  }

  function alterarSenha(
    tokenProfessor: string,
    corpo: Record<string, unknown>,
  ): ReturnType<FastifyInstance['inject']> {
    return app.inject({
      method: 'PATCH',
      url: '/auth/senha',
      headers: { authorization: `Bearer ${tokenProfessor}` },
      payload: corpo,
    });
  }

  it('RH redefine a senha: devolve senha temporaria e marca deve_trocar_senha', async () => {
    const tokenAdmin = await autenticarAdmin();

    const resposta = await redefinirSenha(tokenAdmin, professorId);
    expect(resposta.statusCode).toBe(200);
    const { senha_temporaria: senhaTemporaria } = resposta.json();
    expect(typeof senhaTemporaria).toBe('string');
    expect(senhaTemporaria.length).toBeGreaterThanOrEqual(10);

    // A senha antiga para de funcionar...
    const loginAntigo = await logarProfessor(PROFESSOR.senha);
    expect(loginAntigo.statusCode).toBe(401);

    // ...e a temporaria loga, com o aviso de troca obrigatoria.
    const loginNovo = await logarProfessor(senhaTemporaria);
    expect(loginNovo.statusCode).toBe(200);
    expect(loginNovo.json().usuario.deve_trocar_senha).toBe(true);

    const professor = await prisma.professor.findUniqueOrThrow({
      where: { id: professorId },
    });
    expect(professor.deveTrocarSenha).toBe(true);
  });

  it('revoga os refresh tokens existentes ao redefinir a senha', async () => {
    const loginInicial = await logarProfessor(PROFESSOR.senha);
    const refreshAntigo = loginInicial.json().refresh_token as string;

    const tokenAdmin = await autenticarAdmin();
    await redefinirSenha(tokenAdmin, professorId);

    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshAntigo },
    });
    expect(resposta.statusCode).toBe(401);
  });

  it('so admin pode redefinir a senha de um professor', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;

    const resposta = await redefinirSenha(tokenProfessor, professorId);
    expect(resposta.statusCode).toBe(403);
  });

  it('404 ao redefinir a senha de um professor inexistente', async () => {
    const tokenAdmin = await autenticarAdmin();
    const resposta = await redefinirSenha(
      tokenAdmin,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(resposta.statusCode).toBe(404);
  });

  it('professor troca a propria senha informando a atual', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;

    const resposta = await alterarSenha(tokenProfessor, {
      senha_atual: PROFESSOR.senha,
      senha_nova: 'senhaNova456',
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().usuario.deve_trocar_senha).toBe(false);

    expect((await logarProfessor(PROFESSOR.senha)).statusCode).toBe(401);
    expect((await logarProfessor('senhaNova456')).statusCode).toBe(200);
  });

  it('recusa trocar a senha informando a senha atual errada', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;

    const resposta = await alterarSenha(tokenProfessor, {
      senha_atual: 'senha-errada',
      senha_nova: 'senhaNova456',
    });

    expect(resposta.statusCode).toBe(401);
    expect((await logarProfessor(PROFESSOR.senha)).statusCode).toBe(200);
  });

  it('recusa senha_nova igual a senha_atual', async () => {
    const tokenProfessor = (await logarProfessor(PROFESSOR.senha)).json()
      .access_token as string;

    const resposta = await alterarSenha(tokenProfessor, {
      senha_atual: PROFESSOR.senha,
      senha_nova: PROFESSOR.senha,
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('conclui o fluxo completo: RH reseta, professor loga e define a senha definitiva', async () => {
    const tokenAdmin = await autenticarAdmin();
    const { senha_temporaria: senhaTemporaria } = (
      await redefinirSenha(tokenAdmin, professorId)
    ).json();

    const login = await logarProfessor(senhaTemporaria);
    expect(login.statusCode).toBe(200);
    expect(login.json().usuario.deve_trocar_senha).toBe(true);
    const tokenProfessor = login.json().access_token as string;

    const troca = await alterarSenha(tokenProfessor, {
      senha_atual: senhaTemporaria,
      senha_nova: 'minhaSenhaDefinitiva1',
    });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().usuario.deve_trocar_senha).toBe(false);

    const loginFinal = await logarProfessor('minhaSenhaDefinitiva1');
    expect(loginFinal.statusCode).toBe(200);
    expect(loginFinal.json().usuario.deve_trocar_senha).toBe(false);
  });
});
