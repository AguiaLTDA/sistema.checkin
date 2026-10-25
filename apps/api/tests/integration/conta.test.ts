import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { gerarHashSenha } from '../../src/lib/senha.js';
import { prisma } from '../../src/prisma.js';

/**
 * Conta do proprio RH: editar nome/email (PATCH /admin/conta) e trocar a
 * senha (PATCH /admin/conta/senha). Mesmo banco de teste das demais suites.
 */
const bancoDisponivel = await prisma
  .$connect()
  .then(() => true)
  .catch(() => false);

const ADMIN = { nome: 'RH Teste', email: 'rh@univc.br', senha: 'admin123' };
const OUTRO_ADMIN = { nome: 'Coordenacao', email: 'coord@univc.br', senha: 'coord123' };

describe.skipIf(!bancoDisponivel)('conta do proprio RH', () => {
  let app: FastifyInstance;

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
    for (const admin of [ADMIN, OUTRO_ADMIN]) {
      await prisma.admin.create({
        data: {
          nome: admin.nome,
          email: admin.email,
          senhaHash: await gerarHashSenha(admin.senha),
        },
      });
    }
  });

  async function login(email: string, senha: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/admin/login',
      payload: { email, senha },
    });
  }

  async function tokenDoAdmin(): Promise<string> {
    const resposta = await login(ADMIN.email, ADMIN.senha);
    expect(resposta.statusCode).toBe(200);
    return resposta.json().access_token as string;
  }

  function patch(token: string, url: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  it('edita o proprio nome e email, e o novo email passa a ser o login', async () => {
    const token = await tokenDoAdmin();

    const resposta = await patch(token, '/admin/conta', {
      nome: 'Rejane Ferreira',
      email: 'Rejane.Ferreira@univc.br',
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().usuario).toMatchObject({
      nome: 'Rejane Ferreira',
      email: 'rejane.ferreira@univc.br',
      papel: 'ADMIN',
    });

    expect((await login(ADMIN.email, ADMIN.senha)).statusCode).toBe(401);
    expect(
      (await login('rejane.ferreira@univc.br', ADMIN.senha)).statusCode,
    ).toBe(200);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/admin/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.json().usuario.nome).toBe('Rejane Ferreira');
  });

  it('aceita editar so o nome', async () => {
    const token = await tokenDoAdmin();
    const resposta = await patch(token, '/admin/conta', { nome: 'Novo Nome RH' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().usuario.email).toBe(ADMIN.email);
  });

  it('nao mexe na conta de outro administrador', async () => {
    const token = await tokenDoAdmin();
    await patch(token, '/admin/conta', { nome: 'Somente Eu' });

    const outro = await prisma.admin.findUniqueOrThrow({
      where: { email: OUTRO_ADMIN.email },
    });
    expect(outro.nome).toBe(OUTRO_ADMIN.nome);
  });

  it('recusa email ja usado por outro administrador (409)', async () => {
    const token = await tokenDoAdmin();
    const resposta = await patch(token, '/admin/conta', { email: OUTRO_ADMIN.email });
    expect(resposta.statusCode).toBe(409);
  });

  it('recusa corpo vazio ou invalido (400)', async () => {
    const token = await tokenDoAdmin();
    expect((await patch(token, '/admin/conta', {})).statusCode).toBe(400);
    expect(
      (await patch(token, '/admin/conta', { email: 'sem-arroba' })).statusCode,
    ).toBe(400);
    expect((await patch(token, '/admin/conta', { nome: 'ab' })).statusCode).toBe(400);
  });

  it('registra a edicao na auditoria sem gravar os dados', async () => {
    const token = await tokenDoAdmin();
    await patch(token, '/admin/conta', { nome: 'Rejane Ferreira' });

    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'EDICAO_ADMIN' } });
    expect(log?.adminId).toBeTruthy();
    expect(log?.detalhes).toEqual({ campos: ['nome'] });
  });

  it('troca a senha com a senha atual e derruba as sessoes antigas', async () => {
    const primeiro = await login(ADMIN.email, ADMIN.senha);
    const token = primeiro.json().access_token as string;
    const refresh = primeiro.json().refresh_token as string;

    const troca = await patch(token, '/admin/conta/senha', {
      senha_atual: ADMIN.senha,
      senha_nova: 'NovaSenha2026',
    });
    expect(troca.statusCode).toBe(204);

    expect((await login(ADMIN.email, ADMIN.senha)).statusCode).toBe(401);
    expect((await login(ADMIN.email, 'NovaSenha2026')).statusCode).toBe(200);

    const renovar = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refresh },
    });
    expect(renovar.statusCode).toBe(401);
  });

  it('recusa a troca com a senha atual errada (401) e mantem a senha', async () => {
    const token = await tokenDoAdmin();
    const troca = await patch(token, '/admin/conta/senha', {
      senha_atual: 'errada123',
      senha_nova: 'NovaSenha2026',
    });
    expect(troca.statusCode).toBe(401);
    expect((await login(ADMIN.email, ADMIN.senha)).statusCode).toBe(200);
  });

  it('recusa senha nova igual a atual ou curta (400)', async () => {
    const token = await tokenDoAdmin();
    expect(
      (
        await patch(token, '/admin/conta/senha', {
          senha_atual: ADMIN.senha,
          senha_nova: ADMIN.senha,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await patch(token, '/admin/conta/senha', {
          senha_atual: ADMIN.senha,
          senha_nova: '123',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('as rotas da conta exigem login de admin', async () => {
    const semToken = await app.inject({
      method: 'PATCH',
      url: '/admin/conta',
      payload: { nome: 'Qualquer Um' },
    });
    expect(semToken.statusCode).toBe(401);

    const perfil = await prisma.perfil.create({ data: { nome: 'Professor' } });
    await prisma.professor.create({
      data: {
        nome: 'Ana Rocha',
        cpf: '11122233344',
        email: 'ana.rocha@univc.br',
        cursoVinculado: 'Direito',
        perfilId: perfil.id,
        senhaHash: await gerarHashSenha('senha123'),
      },
    });
    const loginProfessor = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana.rocha@univc.br', senha: 'senha123' },
    });
    const comoProfessor = await patch(
      loginProfessor.json().access_token as string,
      '/admin/conta',
      { nome: 'Invasora' },
    );
    expect(comoProfessor.statusCode).toBe(403);
  });
});
