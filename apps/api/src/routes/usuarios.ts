import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  atualizarPerfilBodySchema,
  atualizarUsuarioBodySchema,
  criarPerfilBodySchema,
  criarUsuarioBodySchema,
  idParamSchema,
} from '@univc/shared';
import { registrarAuditoria } from '../lib/auditoria.js';
import { erroConflito, erroNaoEncontrado, erroValidacao } from '../lib/erros.js';
import { gerarHashSenha } from '../lib/senha.js';
import { perfilParaDTO, professorParaUsuarioDTO } from '../lib/serializar.js';
import { validar } from '../lib/validacao.js';
import { exigirAdmin, usuarioAutenticado } from '../plugins/autenticacao.js';
import { prisma } from '../prisma.js';

/**
 * Cadastro feito pelo RH: usuarios que batem ponto (professores, estagiarios,
 * estudantes...) e os perfis que classificam esses usuarios.
 */
export async function rotasUsuarios(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', exigirAdmin);

  // -------------------------------------------------------------------------
  // Perfis
  // -------------------------------------------------------------------------

  app.get('/admin/perfis', async (_request, reply) => {
    const perfis = await prisma.perfil.findMany({
      orderBy: { nome: 'asc' },
      include: { _count: { select: { usuarios: true } } },
    });
    return reply.send({ dados: perfis.map(perfilParaDTO) });
  });

  app.post('/admin/perfis', async (request, reply) => {
    const admin = usuarioAutenticado(request);
    const corpo = validar(criarPerfilBodySchema, request.body);

    const perfil = await comUnicidade(() =>
      prisma.perfil.create({
        data: { nome: corpo.nome, descricao: corpo.descricao || null },
        include: { _count: { select: { usuarios: true } } },
      }),
    );

    await registrarAuditoria(request, {
      acao: 'PERFIL_CRIADO',
      resultado: 'SUCESSO',
      adminId: admin.id,
      detalhes: { perfil_id: perfil.id, nome: perfil.nome },
    });

    return reply.status(201).send({ perfil: perfilParaDTO(perfil) });
  });

  app.patch('/admin/perfis/:id', async (request, reply) => {
    const admin = usuarioAutenticado(request);
    const { id } = validar(idParamSchema, request.params, 'parametros');
    const corpo = validar(atualizarPerfilBodySchema, request.body);

    const existente = await prisma.perfil.findUnique({ where: { id } });
    if (!existente) throw erroNaoEncontrado('Perfil nao encontrado.');

    const perfil = await comUnicidade(() =>
      prisma.perfil.update({
        where: { id },
        data: {
          ...(corpo.nome !== undefined ? { nome: corpo.nome } : {}),
          ...(corpo.descricao !== undefined
            ? { descricao: corpo.descricao || null }
            : {}),
          ...(corpo.ativo !== undefined ? { ativo: corpo.ativo } : {}),
        },
        include: { _count: { select: { usuarios: true } } },
      }),
    );

    await registrarAuditoria(request, {
      acao: 'PERFIL_ATUALIZADO',
      resultado: 'SUCESSO',
      adminId: admin.id,
      detalhes: {
        perfil_id: id,
        nome_anterior: existente.nome,
        campos: Object.keys(corpo),
      },
    });

    return reply.send({ perfil: perfilParaDTO(perfil) });
  });

  // -------------------------------------------------------------------------
  // Usuarios
  // -------------------------------------------------------------------------

  app.get('/admin/usuarios', async (_request, reply) => {
    const usuarios = await prisma.professor.findMany({
      orderBy: { nome: 'asc' },
      include: { perfil: true },
    });
    return reply.send({ dados: usuarios.map(professorParaUsuarioDTO) });
  });

  app.post('/admin/usuarios', async (request, reply) => {
    const admin = usuarioAutenticado(request);
    const corpo = validar(criarUsuarioBodySchema, request.body);
    await exigirPerfilAtivo(corpo.perfil_id);

    const usuario = await comUnicidade(async () =>
      prisma.professor.create({
        data: {
          nome: corpo.nome,
          cpf: corpo.cpf,
          email: corpo.email,
          senhaHash: await gerarHashSenha(corpo.senha),
          cursoVinculado: corpo.curso_vinculado,
          perfilId: corpo.perfil_id,
        },
        include: { perfil: true },
      }),
    );

    await registrarAuditoria(request, {
      acao: 'USUARIO_CRIADO',
      resultado: 'SUCESSO',
      adminId: admin.id,
      professorId: usuario.id,
      detalhes: { email: usuario.email, perfil: usuario.perfil?.nome ?? null },
    });

    return reply.status(201).send({ usuario: professorParaUsuarioDTO(usuario) });
  });

  app.patch('/admin/usuarios/:id', async (request, reply) => {
    const admin = usuarioAutenticado(request);
    const { id } = validar(idParamSchema, request.params, 'parametros');
    const corpo = validar(atualizarUsuarioBodySchema, request.body);

    const existente = await prisma.professor.findUnique({ where: { id } });
    if (!existente) throw erroNaoEncontrado('Usuario nao encontrado.');

    if (corpo.perfil_id !== undefined && corpo.perfil_id !== existente.perfilId) {
      await exigirPerfilAtivo(corpo.perfil_id);
    }

    const usuario = await comUnicidade(async () =>
      prisma.professor.update({
        where: { id },
        data: {
          ...(corpo.nome !== undefined ? { nome: corpo.nome } : {}),
          ...(corpo.email !== undefined ? { email: corpo.email } : {}),
          ...(corpo.curso_vinculado !== undefined
            ? { cursoVinculado: corpo.curso_vinculado }
            : {}),
          ...(corpo.perfil_id !== undefined ? { perfilId: corpo.perfil_id } : {}),
          ...(corpo.ativo !== undefined ? { ativo: corpo.ativo } : {}),
          ...(corpo.senha !== undefined
            ? { senhaHash: await gerarHashSenha(corpo.senha) }
            : {}),
        },
        include: { perfil: true },
      }),
    );

    // Senha nova ou desativacao encerram as sessoes abertas: o refresh token
    // antigo deixa de valer e o usuario precisa entrar de novo.
    if (corpo.senha !== undefined || corpo.ativo === false) {
      await prisma.refreshToken.updateMany({
        where: { professorId: id, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
    }

    await registrarAuditoria(request, {
      acao: 'USUARIO_ATUALIZADO',
      resultado: 'SUCESSO',
      adminId: admin.id,
      professorId: id,
      // Lista so os nomes dos campos: a senha nunca vai para a auditoria.
      detalhes: { campos: Object.keys(corpo) },
    });

    return reply.send({ usuario: professorParaUsuarioDTO(usuario) });
  });
}

async function exigirPerfilAtivo(perfilId: string): Promise<void> {
  const perfil = await prisma.perfil.findUnique({ where: { id: perfilId } });
  if (!perfil) throw erroValidacao('Perfil informado nao existe.');
  if (!perfil.ativo) {
    throw erroValidacao(`O perfil "${perfil.nome}" esta desativado.`);
  }
}

const ROTULOS_CAMPO_UNICO: Record<string, string> = {
  email: 'Ja existe um usuario com este email.',
  cpf: 'Ja existe um usuario com este CPF.',
  nome: 'Ja existe um perfil com este nome.',
};

/** Converte violacao de unicidade do Prisma (P2002) em 409 legivel. */
async function comUnicidade<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === 'P2002'
    ) {
      const campos = (erro.meta?.target as string[] | undefined) ?? [];
      const campo = campos.find((nome) => nome in ROTULOS_CAMPO_UNICO);
      throw erroConflito(
        campo ? ROTULOS_CAMPO_UNICO[campo]! : 'Registro duplicado.',
        { campos },
      );
    }
    throw erro;
  }
}
