import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  alterarSenhaBodySchema,
  atualizarContaAdminBodySchema,
} from '@univc/shared';
import { registrarAuditoria } from '../lib/auditoria.js';
import { erroConflito, erroNaoAutenticado } from '../lib/erros.js';
import { conferirSenha, gerarHashSenha } from '../lib/senha.js';
import { adminParaUsuario } from '../lib/serializar.js';
import { validar } from '../lib/validacao.js';
import { exigirAdmin, usuarioAutenticado } from '../plugins/autenticacao.js';
import { prisma } from '../prisma.js';

/**
 * Conta do proprio RH: o administrador logado edita os seus dados de cadastro
 * (nome e email) e troca a propria senha. Nao ha rota para editar outro admin.
 */
export async function rotasConta(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', exigirAdmin);

  /** Edita nome e/ou email do admin logado. */
  app.patch('/admin/conta', async (request, reply) => {
    const logado = usuarioAutenticado(request);
    const dados = validar(atualizarContaAdminBodySchema, request.body);

    let atualizado;
    try {
      atualizado = await prisma.admin.update({
        where: { id: logado.id },
        data: {
          ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
          ...(dados.email !== undefined ? { email: dados.email } : {}),
        },
      });
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw erroConflito('Ja existe um administrador com este email.');
      }
      throw erro;
    }

    await registrarAuditoria(request, {
      acao: 'EDICAO_ADMIN',
      resultado: 'SUCESSO',
      adminId: logado.id,
      // So os nomes dos campos: nada de email ou senha no log.
      detalhes: { campos: Object.keys(dados) },
    });

    return reply.send({ usuario: adminParaUsuario(atualizado) });
  });

  /**
   * Troca a senha do admin logado. Exige a senha atual (confirma que quem troca
   * e o dono da conta, mesmo com o token em maos) e revoga todos os refresh
   * tokens: as outras sessoes caem e o proprio admin entra de novo.
   */
  app.patch('/admin/conta/senha', async (request, reply) => {
    const logado = usuarioAutenticado(request);
    const { senha_atual: senhaAtual, senha_nova: senhaNova } = validar(
      alterarSenhaBodySchema,
      request.body,
    );

    const admin = await prisma.admin.findUniqueOrThrow({
      where: { id: logado.id },
    });

    if (!(await conferirSenha(senhaAtual, admin.senhaHash))) {
      await registrarAuditoria(request, {
        acao: 'ALTERACAO_SENHA',
        resultado: 'REJEITADO',
        adminId: admin.id,
      });
      throw erroNaoAutenticado('Senha atual incorreta.');
    }

    await prisma.$transaction([
      prisma.admin.update({
        where: { id: admin.id },
        data: { senhaHash: await gerarHashSenha(senhaNova) },
      }),
      prisma.refreshToken.updateMany({
        where: { adminId: admin.id, revogadoEm: null },
        data: { revogadoEm: new Date() },
      }),
    ]);

    await registrarAuditoria(request, {
      acao: 'ALTERACAO_SENHA',
      resultado: 'SUCESSO',
      adminId: admin.id,
    });

    return reply.status(204).send();
  });
}
