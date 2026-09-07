import type { FastifyInstance } from 'fastify';
import type { RespostaLogin } from '@univc/shared';
import { alterarSenhaBodySchema, loginBodySchema, refreshBodySchema } from '@univc/shared';
import { registrarAuditoria } from '../lib/auditoria.js';
import { erroNaoAutenticado } from '../lib/erros.js';
import { adminParaUsuario, professorParaUsuario } from '../lib/serializar.js';
import { HASH_FICTICIO, conferirSenha, gerarHashSenha } from '../lib/senha.js';
import {
  gerarAccessToken,
  gerarRefreshToken,
  hashToken,
  segundosDeAcesso,
  verificarRefreshToken,
} from '../lib/tokens.js';
import { validar } from '../lib/validacao.js';
import {
  exigirAdmin,
  exigirProfessor,
  usuarioAutenticado,
} from '../plugins/autenticacao.js';
import { prisma } from '../prisma.js';

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  /**
   * Login do professor (app mobile).
   * Responde 401 generico tanto para email inexistente quanto para senha
   * errada, para nao revelar quais emails estao cadastrados.
   */
  app.post('/auth/login', async (request, reply) => {
    const { email, senha } = validar(loginBodySchema, request.body);

    const professor = await prisma.professor.findUnique({ where: { email } });
    const senhaConfere = await conferirSenha(
      senha,
      professor?.senhaHash ?? HASH_FICTICIO,
    );

    if (!professor || !senhaConfere || !professor.ativo) {
      await registrarAuditoria(request, {
        acao: 'LOGIN_FALHA',
        resultado: 'REJEITADO',
        professorId: professor?.id ?? null,
        detalhes: {
          email,
          motivo: !professor
            ? 'EMAIL_NAO_ENCONTRADO'
            : !senhaConfere
              ? 'SENHA_INCORRETA'
              : 'PROFESSOR_INATIVO',
        },
      });
      throw erroNaoAutenticado('Email ou senha invalidos.');
    }

    const resposta = await emitirSessao(
      professor.id,
      'PROFESSOR',
      professor.nome,
      professor.email,
      professorParaUsuario(professor),
    );

    await registrarAuditoria(request, {
      acao: 'LOGIN_SUCESSO',
      resultado: 'SUCESSO',
      professorId: professor.id,
      detalhes: { email },
    });

    return reply.send(resposta);
  });

  /** Login do administrador (dashboard de RH/coordenacao). */
  app.post('/auth/admin/login', async (request, reply) => {
    const { email, senha } = validar(loginBodySchema, request.body);

    const admin = await prisma.admin.findUnique({ where: { email } });
    const senhaConfere = await conferirSenha(
      senha,
      admin?.senhaHash ?? HASH_FICTICIO,
    );

    if (!admin || !senhaConfere || !admin.ativo) {
      await registrarAuditoria(request, {
        acao: 'LOGIN_FALHA',
        resultado: 'REJEITADO',
        adminId: admin?.id ?? null,
        detalhes: { email, perfil: 'ADMIN' },
      });
      throw erroNaoAutenticado('Email ou senha invalidos.');
    }

    const resposta = await emitirSessao(
      admin.id,
      'ADMIN',
      admin.nome,
      admin.email,
      adminParaUsuario(admin),
    );

    await registrarAuditoria(request, {
      acao: 'LOGIN_SUCESSO',
      resultado: 'SUCESSO',
      adminId: admin.id,
      detalhes: { email, perfil: 'ADMIN' },
    });

    return reply.send(resposta);
  });

  /**
   * Troca um refresh token valido por um novo par de tokens.
   * O token antigo e revogado na mesma transacao (rotacao), de modo que um
   * refresh reutilizado nao vale mais nada.
   */
  app.post('/auth/refresh', async (request, reply) => {
    const { refresh_token: refreshToken } = validar(
      refreshBodySchema,
      request.body,
    );
    const payload = verificarRefreshToken(refreshToken);

    const armazenado = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!armazenado || armazenado.revogadoEm || armazenado.expiraEm < new Date()) {
      throw erroNaoAutenticado('Refresh token invalido ou ja utilizado.');
    }

    await prisma.refreshToken.update({
      where: { id: armazenado.id },
      data: { revogadoEm: new Date() },
    });

    if (payload.papel === 'PROFESSOR') {
      const professor = await prisma.professor.findUnique({
        where: { id: payload.sub },
      });
      if (!professor || !professor.ativo) {
        throw erroNaoAutenticado('Professor inativo ou inexistente.');
      }
      const resposta = await emitirSessao(
        professor.id,
        'PROFESSOR',
        professor.nome,
        professor.email,
        professorParaUsuario(professor),
      );
      await registrarAuditoria(request, {
        acao: 'REFRESH_TOKEN',
        resultado: 'SUCESSO',
        professorId: professor.id,
      });
      return reply.send(resposta);
    }

    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.ativo) {
      throw erroNaoAutenticado('Administrador inativo ou inexistente.');
    }
    const resposta = await emitirSessao(
      admin.id,
      'ADMIN',
      admin.nome,
      admin.email,
      adminParaUsuario(admin),
    );
    await registrarAuditoria(request, {
      acao: 'REFRESH_TOKEN',
      resultado: 'SUCESSO',
      adminId: admin.id,
    });
    return reply.send(resposta);
  });

  /** Revoga o refresh token informado (logout). */
  app.post('/auth/logout', async (request, reply) => {
    const { refresh_token: refreshToken } = validar(
      refreshBodySchema,
      request.body,
    );

    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revogadoEm: null },
      data: { revogadoEm: new Date() },
    });

    await registrarAuditoria(request, {
      acao: 'LOGOUT',
      resultado: 'SUCESSO',
    });

    return reply.status(204).send();
  });

  /**
   * Professor troca a propria senha. Serve tanto a troca obrigatoria depois
   * de um reset do RH (`deve_trocar_senha`) quanto uma troca voluntaria —
   * exigir `senha_atual` nos dois casos confirma que quem esta trocando e o
   * dono da conta, mesmo com o access token em maos.
   */
  app.patch(
    '/auth/senha',
    { preHandler: exigirProfessor },
    async (request, reply) => {
      const usuario = usuarioAutenticado(request);
      const { senha_atual: senhaAtual, senha_nova: senhaNova } = validar(
        alterarSenhaBodySchema,
        request.body,
      );

      const professor = await prisma.professor.findUniqueOrThrow({
        where: { id: usuario.id },
      });

      if (!(await conferirSenha(senhaAtual, professor.senhaHash))) {
        await registrarAuditoria(request, {
          acao: 'ALTERACAO_SENHA',
          resultado: 'REJEITADO',
          professorId: professor.id,
        });
        throw erroNaoAutenticado('Senha atual incorreta.');
      }

      const atualizado = await prisma.professor.update({
        where: { id: professor.id },
        data: {
          senhaHash: await gerarHashSenha(senhaNova),
          deveTrocarSenha: false,
        },
      });

      await registrarAuditoria(request, {
        acao: 'ALTERACAO_SENHA',
        resultado: 'SUCESSO',
        professorId: professor.id,
      });

      return reply.send({ usuario: professorParaUsuario(atualizado) });
    },
  );

  app.get(
    '/auth/me',
    { preHandler: exigirProfessor },
    async (request, reply) => {
      const usuario = usuarioAutenticado(request);
      const professor = await prisma.professor.findUniqueOrThrow({
        where: { id: usuario.id },
      });
      return reply.send({ usuario: professorParaUsuario(professor) });
    },
  );

  app.get('/auth/admin/me', { preHandler: exigirAdmin }, async (request, reply) => {
    const usuario = usuarioAutenticado(request);
    return reply.send({ usuario: adminParaUsuario(usuario) });
  });
}

async function emitirSessao(
  id: string,
  papel: 'PROFESSOR' | 'ADMIN',
  nome: string,
  email: string,
  usuario: RespostaLogin['usuario'],
): Promise<RespostaLogin> {
  const accessToken = gerarAccessToken({ sub: id, papel, nome, email });
  const refresh = gerarRefreshToken(id, papel);

  await prisma.refreshToken.create({
    data: {
      tokenHash: refresh.hash,
      expiraEm: refresh.expiraEm,
      professorId: papel === 'PROFESSOR' ? id : null,
      adminId: papel === 'ADMIN' ? id : null,
    },
  });

  return {
    access_token: accessToken,
    refresh_token: refresh.token,
    expira_em: segundosDeAcesso(),
    usuario,
  };
}
