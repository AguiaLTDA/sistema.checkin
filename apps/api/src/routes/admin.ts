import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  JornadaProfessor,
  RegistroPontoDTO,
  RelatorioJornada,
  RespostaPaginada,
} from '@univc/shared';
import {
  adminRegistrosQuerySchema,
  decisaoManualBodySchema,
  idParamSchema,
  relatorioJornadaQuerySchema,
} from '@univc/shared';
import { env } from '../env.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { filtroPeriodo, interpretarData } from '../lib/datas.js';
import { erroConflito, erroNaoEncontrado } from '../lib/erros.js';
import {
  calcularJornada,
  formatarHoras,
  type RegistroJornada,
} from '../lib/jornada.js';
import { registroParaDTO } from '../lib/serializar.js';
import { gerarHashSenha, gerarSenhaTemporaria } from '../lib/senha.js';
import { validar } from '../lib/validacao.js';
import { exigirAdmin, usuarioAutenticado } from '../plugins/autenticacao.js';
import { prisma } from '../prisma.js';

export async function rotasAdmin(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', exigirAdmin);

  /** Registros de todos os professores, com filtros e paginacao. */
  app.get('/admin/registros', async (request, reply) => {
    const query = validar(adminRegistrosQuerySchema, request.query, 'query');
    const periodo = filtroPeriodo(
      query.data_inicio,
      query.data_fim,
      env.RELATORIO_TIMEZONE,
    );

    const where = {
      ...(query.professor_id ? { professorId: query.professor_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(periodo ? { timestampServidor: periodo } : {}),
      ...(query.curso
        ? { professor: { cursoVinculado: { equals: query.curso } } }
        : {}),
    };

    const [total, registros] = await Promise.all([
      prisma.registroPonto.count({ where }),
      prisma.registroPonto.findMany({
        where,
        include: { campus: true, professor: true },
        orderBy: { timestampServidor: 'desc' },
        skip: (query.pagina - 1) * query.por_pagina,
        take: query.por_pagina,
      }),
    ]);

    const resposta: RespostaPaginada<RegistroPontoDTO> = {
      dados: registros.map(registroParaDTO),
      paginacao: {
        pagina: query.pagina,
        por_pagina: query.por_pagina,
        total,
        total_paginas: Math.max(1, Math.ceil(total / query.por_pagina)),
      },
    };

    return reply.send(resposta);
  });

  /**
   * Aprovacao manual de um registro pendente.
   * `justificativa_manual` e obrigatoria: e o que documenta, para auditoria,
   * por que o RH aceitou um registro que a geocerca nao validou.
   */
  app.patch('/admin/registros/:id/aprovar', async (request, reply) => {
    return decidirRegistro(request, reply, 'VALIDADO');
  });

  /** Rejeicao manual, tambem com justificativa obrigatoria. */
  app.patch('/admin/registros/:id/rejeitar', async (request, reply) => {
    return decidirRegistro(request, reply, 'REJEITADO');
  });

  /**
   * Jornada por professor e por dia: pares de chegada/saida, horas trabalhadas
   * e inconsistencias apontadas.
   */
  app.get('/admin/relatorio-jornada', async (request, reply) => {
    const query = validar(relatorioJornadaQuerySchema, request.query, 'query');
    const timezone = env.RELATORIO_TIMEZONE;

    const inicio = interpretarData(query.data_inicio, timezone, 'inicio');
    const fim = interpretarData(query.data_fim, timezone, 'fim');

    if (inicio >= fim) {
      throw erroConflito('data_inicio deve ser anterior ou igual a data_fim.');
    }

    const professores = await prisma.professor.findMany({
      where: {
        ...(query.professor_id ? { id: query.professor_id } : {}),
        ...(query.curso ? { cursoVinculado: { equals: query.curso } } : {}),
      },
      orderBy: { nome: 'asc' },
    });

    const registros = await prisma.registroPonto.findMany({
      where: {
        professorId: { in: professores.map((professor) => professor.id) },
        timestampServidor: { gte: inicio, lt: fim },
      },
      orderBy: { timestampServidor: 'asc' },
      select: {
        id: true,
        professorId: true,
        tipo: true,
        status: true,
        timestampServidor: true,
        registradoOfflineEm: true,
      },
    });

    const porProfessor = new Map<string, RegistroJornada[]>();
    for (const registro of registros) {
      const lista = porProfessor.get(registro.professorId) ?? [];
      lista.push({
        id: registro.id,
        tipo: registro.tipo,
        status: registro.status,
        // Registros offline usam o horario declarado pelo aparelho no
        // relatorio; ate a aprovacao do RH eles ficam como PENDENTE_APROVACAO
        // e o dia aparece marcado como inconsistente.
        momento: registro.registradoOfflineEm ?? registro.timestampServidor,
      });
      porProfessor.set(registro.professorId, lista);
    }

    const linhas: JornadaProfessor[] = professores.map((professor) => {
      const dias = calcularJornada(
        porProfessor.get(professor.id) ?? [],
        timezone,
      );
      const minutosTotal = dias.reduce(
        (soma, dia) => soma + dia.minutos_trabalhados,
        0,
      );

      return {
        professor: {
          id: professor.id,
          nome: professor.nome,
          email: professor.email,
          curso_vinculado: professor.cursoVinculado,
        },
        dias,
        minutos_trabalhados_total: minutosTotal,
        horas_trabalhadas_total: formatarHoras(minutosTotal),
        total_inconsistencias: dias.reduce(
          (soma, dia) => soma + dia.inconsistencias.length,
          0,
        ),
      };
    });

    const relatorio: RelatorioJornada = {
      periodo: {
        data_inicio: query.data_inicio,
        data_fim: query.data_fim,
        timezone,
      },
      professores: linhas,
    };

    return reply.send(relatorio);
  });

  /** Lista de professores, para popular os filtros do dashboard. */
  app.get('/admin/professores', async (_request, reply) => {
    const professores = await prisma.professor.findMany({
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        cursoVinculado: true,
        ativo: true,
      },
    });

    return reply.send({
      dados: professores.map((professor) => ({
        id: professor.id,
        nome: professor.nome,
        email: professor.email,
        curso_vinculado: professor.cursoVinculado,
        ativo: professor.ativo,
      })),
    });
  });

  /**
   * Redefine a senha de um professor (esqueceu a senha, ou primeiro acesso).
   * Gera uma senha temporaria legivel e devolve em texto puro UMA VEZ, nesta
   * resposta — o RH repassa ao professor por fora do sistema (nada disso fica
   * gravado, so o hash). O professor fica marcado com `deve_trocar_senha` e
   * so escolhe a senha definitiva em PATCH /auth/senha, no proprio primeiro
   * login. Sessoes anteriores sao revogadas: um reset costuma acontecer
   * porque a conta pode ter sido comprometida, entao nao faz sentido deixar
   * um refresh token antigo continuar valendo.
   */
  app.patch('/admin/professores/:id/redefinir-senha', async (request, reply) => {
    const admin = usuarioAutenticado(request);
    const { id } = validar(idParamSchema, request.params, 'parametros');

    const professor = await prisma.professor.findUnique({ where: { id } });
    if (!professor) throw erroNaoEncontrado('Professor nao encontrado.');

    const senhaTemporaria = gerarSenhaTemporaria();

    await prisma.$transaction([
      prisma.professor.update({
        where: { id },
        data: {
          senhaHash: await gerarHashSenha(senhaTemporaria),
          deveTrocarSenha: true,
        },
      }),
      prisma.refreshToken.updateMany({
        where: { professorId: id, revogadoEm: null },
        data: { revogadoEm: new Date() },
      }),
    ]);

    await registrarAuditoria(request, {
      acao: 'REDEFINICAO_SENHA',
      resultado: 'SUCESSO',
      adminId: admin.id,
      professorId: id,
    });

    return reply.send({ senha_temporaria: senhaTemporaria });
  });

  /** Cursos distintos com professor cadastrado. */
  app.get('/admin/cursos', async (_request, reply) => {
    const cursos = await prisma.professor.findMany({
      distinct: ['cursoVinculado'],
      select: { cursoVinculado: true },
      orderBy: { cursoVinculado: 'asc' },
    });

    return reply.send({ dados: cursos.map((curso) => curso.cursoVinculado) });
  });

  app.get('/admin/campi', async (_request, reply) => {
    const campi = await prisma.campus.findMany({ orderBy: { nome: 'asc' } });
    return reply.send({
      dados: campi.map((campus) => ({
        id: campus.id,
        nome: campus.nome,
        latitude_central: campus.latitudeCentral,
        longitude_central: campus.longitudeCentral,
        raio_permitido_metros: campus.raioPermitidoMetros,
      })),
    });
  });
}

async function decidirRegistro(
  request: FastifyRequest,
  reply: FastifyReply,
  novoStatus: 'VALIDADO' | 'REJEITADO',
) {
  const admin = usuarioAutenticado(request);
  const { id } = validar(idParamSchema, request.params, 'parametros');
  const { justificativa_manual: justificativa } = validar(
    decisaoManualBodySchema,
    request.body,
  );

  const registro = await prisma.registroPonto.findUnique({ where: { id } });
  if (!registro) throw erroNaoEncontrado('Registro de ponto nao encontrado.');

  if (registro.status !== 'PENDENTE_APROVACAO') {
    throw erroConflito(
      `Somente registros PENDENTE_APROVACAO podem ser decididos manualmente. Este esta como ${registro.status}.`,
    );
  }

  const atualizado = await prisma.registroPonto.update({
    where: { id },
    data: {
      status: novoStatus,
      justificativaManual: justificativa,
      decididoPor: admin.id,
      decididoEm: new Date(),
    },
    include: { campus: true, professor: true },
  });

  await registrarAuditoria(request, {
    acao: novoStatus === 'VALIDADO' ? 'APROVACAO_MANUAL' : 'REJEICAO_MANUAL',
    resultado: 'SUCESSO',
    adminId: admin.id,
    professorId: registro.professorId,
    registroId: registro.id,
    detalhes: {
      status_anterior: registro.status,
      status_novo: novoStatus,
      justificativa_manual: justificativa,
    },
  });

  return reply.send({ registro: registroParaDTO(atualizado) });
}
