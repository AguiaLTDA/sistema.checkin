import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  atualizarPerfilBodySchema,
  criarPerfilBodySchema,
  idParamSchema,
} from '@univc/shared';
import { registrarAuditoria } from '../lib/auditoria.js';
import { erroConflito, erroNaoEncontrado } from '../lib/erros.js';
import { perfilParaDTO } from '../lib/serializar.js';
import { validar } from '../lib/validacao.js';
import { exigirAdmin, usuarioAutenticado } from '../plugins/autenticacao.js';
import { prisma } from '../prisma.js';

/**
 * Perfis que classificam quem bate ponto (Professor, Estagiario, Estudante...).
 * O RH cria, renomeia e desativa; o vinculo do usuario com o perfil e feito no
 * cadastro de usuarios (/admin/professores).
 */
export async function rotasPerfis(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', exigirAdmin);

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

    const perfil = await comNomeUnico(() =>
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

    const perfil = await comNomeUnico(() =>
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
}

/** Converte a violacao de unicidade do nome (P2002) em 409 legivel. */
async function comNomeUnico<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === 'P2002'
    ) {
      throw erroConflito('Ja existe um perfil com este nome.');
    }
    throw erro;
  }
}
