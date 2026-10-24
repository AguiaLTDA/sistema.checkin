import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { gerarHashSenha } from '../../src/lib/senha.js';
import { prisma } from '../../src/prisma.js';

/**
 * Cadastro de usuarios e perfis pelo RH: criacao, edicao, desativacao e o
 * login do usuario recem-criado. Mesmo banco de teste da suite de check-in.
 */
const bancoDisponivel = await prisma
  .$connect()
  .then(() => true)
  .catch(() => false);

const ADMIN = { nome: 'RH Teste', email: 'rh@univc.br', senha: 'admin123' };

const NOVO_USUARIO = {
  nome: 'Lucas Ferreira Dias',
  cpf: '666.777.888-99',
  email: 'Lucas.Dias@univc.br',
  senha: 'estagio123',
  curso_vinculado: 'Análise e Desenvolvimento de Sistemas',
};

describe.skipIf(!bancoDisponivel)('cadastro de usuarios e perfis pelo RH', () => {
  let app: FastifyInstance;
  let tokenAdmin: string;
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
      'TRUNCATE TABLE "logs_auditoria", "refresh_tokens", "registros_ponto", "campi", "professores", "admins", "perfis" RESTART IDENTITY CASCADE',
    );

    const perfil = await prisma.perfil.create({ data: { nome: 'Estagiário' } });
    perfilEstagiarioId = perfil.id;

    await prisma.admin.create({
      data: {
        nome: ADMIN.nome,
        email: ADMIN.email,
        senhaHash: await gerarHashSenha(ADMIN.senha),
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/admin/login',
      payload: { email: ADMIN.email, senha: ADMIN.senha },
    });
    tokenAdmin = login.json().access_token as string;
  });

  function comoAdmin(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      ...(payload ? { payload } : {}),
    });
  }

  it('cria um usuario que consegue entrar e bater ponto', async () => {
    const criado = await comoAdmin('POST', '/admin/usuarios', {
      ...NOVO_USUARIO,
      perfil_id: perfilEstagiarioId,
    });

    expect(criado.statusCode).toBe(201);
    const usuario = criado.json().usuario;
    expect(usuario.cpf).toBe('66677788899');
    expect(usuario.email).toBe('lucas.dias@univc.br');
    expect(usuario.perfil).toEqual({ id: perfilEstagiarioId, nome: 'Estagiário' });
    expect(usuario).not.toHaveProperty('senha_hash');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lucas.dias@univc.br', senha: NOVO_USUARIO.senha },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().usuario.perfil).toBe('Estagiário');

    const auditoria = await prisma.logAuditoria.findFirst({
      where: { acao: 'USUARIO_CRIADO' },
    });
    expect(auditoria?.professorId).toBe(usuario.id);
  });

  it('recusa email ou CPF repetido com 409', async () => {
    const payload = { ...NOVO_USUARIO, perfil_id: perfilEstagiarioId };
    expect((await comoAdmin('POST', '/admin/usuarios', payload)).statusCode).toBe(201);

    const emailRepetido = await comoAdmin('POST', '/admin/usuarios', {
      ...payload,
      cpf: '99988877766',
    });
    expect(emailRepetido.statusCode).toBe(409);
    expect(emailRepetido.json().mensagem).toMatch(/email/);

    const cpfRepetido = await comoAdmin('POST', '/admin/usuarios', {
      ...payload,
      email: 'outro@univc.br',
    });
    expect(cpfRepetido.statusCode).toBe(409);
    expect(cpfRepetido.json().mensagem).toMatch(/CPF/);
  });

  it('nao deixa usar um perfil desativado', async () => {
    await comoAdmin('PATCH', `/admin/perfis/${perfilEstagiarioId}`, { ativo: false });

    const resposta = await comoAdmin('POST', '/admin/usuarios', {
      ...NOVO_USUARIO,
      perfil_id: perfilEstagiarioId,
    });
    expect(resposta.statusCode).toBe(400);
  });

  it('desativar o usuario bloqueia o login e encerra as sessoes', async () => {
    const criado = await comoAdmin('POST', '/admin/usuarios', {
      ...NOVO_USUARIO,
      perfil_id: perfilEstagiarioId,
    });
    const id = criado.json().usuario.id as string;

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lucas.dias@univc.br', senha: NOVO_USUARIO.senha },
    });
    const refreshToken = login.json().refresh_token as string;

    const desativado = await comoAdmin('PATCH', `/admin/usuarios/${id}`, { ativo: false });
    expect(desativado.statusCode).toBe(200);
    expect(desativado.json().usuario.ativo).toBe(false);

    const novoLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lucas.dias@univc.br', senha: NOVO_USUARIO.senha },
    });
    expect(novoLogin.statusCode).toBe(401);

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('redefine a senha do usuario', async () => {
    const criado = await comoAdmin('POST', '/admin/usuarios', {
      ...NOVO_USUARIO,
      perfil_id: perfilEstagiarioId,
    });
    const id = criado.json().usuario.id as string;

    await comoAdmin('PATCH', `/admin/usuarios/${id}`, { senha: 'senhanova1' });

    const antiga = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lucas.dias@univc.br', senha: NOVO_USUARIO.senha },
    });
    expect(antiga.statusCode).toBe(401);

    const nova = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lucas.dias@univc.br', senha: 'senhanova1' },
    });
    expect(nova.statusCode).toBe(200);
  });

  it('cria e renomeia perfis, contando os usuarios de cada um', async () => {
    const criado = await comoAdmin('POST', '/admin/perfis', {
      nome: 'Monitor',
      descricao: 'Aluno monitor de disciplina',
    });
    expect(criado.statusCode).toBe(201);
    const monitorId = criado.json().perfil.id as string;

    const duplicado = await comoAdmin('POST', '/admin/perfis', { nome: 'Monitor' });
    expect(duplicado.statusCode).toBe(409);

    await comoAdmin('POST', '/admin/usuarios', { ...NOVO_USUARIO, perfil_id: monitorId });

    const renomeado = await comoAdmin('PATCH', `/admin/perfis/${monitorId}`, {
      nome: 'Monitoria',
    });
    expect(renomeado.statusCode).toBe(200);
    expect(renomeado.json().perfil).toMatchObject({ nome: 'Monitoria', total_usuarios: 1 });

    const lista = await comoAdmin('GET', '/admin/usuarios');
    expect(lista.json().dados[0].perfil.nome).toBe('Monitoria');
  });

  it('as rotas de cadastro sao exclusivas do RH', async () => {
    const criado = await comoAdmin('POST', '/admin/usuarios', {
      ...NOVO_USUARIO,
      perfil_id: perfilEstagiarioId,
    });
    expect(criado.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'lucas.dias@univc.br', senha: NOVO_USUARIO.senha },
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/admin/usuarios',
      headers: { authorization: `Bearer ${login.json().access_token as string}` },
    });
    expect(resposta.statusCode).toBe(403);
  });
});
