import type { FastifyInstance } from 'fastify';
import type { RegistroPontoDTO, RespostaPaginada } from '@univc/shared';
import { checkinBodySchema, historicoQuerySchema } from '@univc/shared';
import { env } from '../env.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { filtroPeriodo } from '../lib/datas.js';
import { erroConflito } from '../lib/erros.js';
import { avaliarGeocerca } from '../lib/geo.js';
import { registroParaDTO } from '../lib/serializar.js';
import { decidirStatus, sequenciaValida } from '../lib/validacao-checkin.js';
import { validar } from '../lib/validacao.js';
import { exigirProfessor, usuarioAutenticado } from '../plugins/autenticacao.js';
import { prisma } from '../prisma.js';

export async function rotasCheckin(app: FastifyInstance): Promise<void> {
  /**
   * Registra chegada ou saida.
   *
   * A presenca e comprovada apenas pela localizacao enviada no corpo: nao ha
   * etapa de biometria em nenhum ponto do fluxo.
   *
   * O horario gravado (`timestamp_servidor`) e sempre `new Date()` aqui no
   * backend. O corpo da requisicao nao tem campo de horario e o schema zod
   * descarta chaves desconhecidas, entao um cliente adulterado nao consegue
   * influenciar o horario do registro.
   */
  app.post(
    '/checkin',
    {
      preHandler: exigirProfessor,
      config: {
        rateLimit: {
          max: env.CHECKIN_RATE_LIMIT_MAX,
          timeWindow: env.CHECKIN_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      const usuario = usuarioAutenticado(request);

      let corpo: ReturnType<typeof checkinBodySchema.parse>;
      try {
        corpo = validar(checkinBodySchema, request.body);
      } catch (erro) {
        // Auditoria tambem das tentativas que nem chegam a virar registro.
        await registrarAuditoria(request, {
          acao: 'TENTATIVA_CHECKIN',
          resultado: 'ERRO',
          professorId: usuario.id,
          detalhes: { motivo: 'PAYLOAD_INVALIDO' },
        });
        throw erro;
      }

      const campi = await prisma.campus.findMany({ where: { ativo: true } });
      const geocerca = avaliarGeocerca(
        { latitude: corpo.latitude, longitude: corpo.longitude },
        campi,
      );

      const ultimo = await prisma.registroPonto.findFirst({
        where: { professorId: usuario.id, status: { not: 'REJEITADO' } },
        orderBy: { timestampServidor: 'desc' },
        select: { tipo: true, timestampServidor: true },
      });

      if (!sequenciaValida(ultimo?.tipo ?? null, corpo.tipo)) {
        await registrarAuditoria(request, {
          acao: 'TENTATIVA_CHECKIN',
          resultado: 'REJEITADO',
          professorId: usuario.id,
          detalhes: {
            motivo: 'SEQUENCIA_INVALIDA',
            tipo_tentado: corpo.tipo,
            tipo_anterior: ultimo?.tipo ?? null,
          },
        });

        throw erroConflito(
          ultimo
            ? `Seu ultimo registro foi "${ultimo.tipo}". Registre "${
                ultimo.tipo === 'CHEGADA' ? 'SAIDA' : 'CHEGADA'
              }" antes de repetir "${corpo.tipo}".`
            : 'Seu primeiro registro precisa ser uma CHEGADA.',
          {
            tipo_anterior: ultimo?.tipo ?? null,
            proximo_tipo_esperado: proximoTipo(ultimo?.tipo ?? null),
          },
        );
      }

      const decisao = decidirStatus({
        geocerca,
        sincronizadoOffline: corpo.sincronizado_offline,
      });

      const registro = await prisma.registroPonto.create({
        data: {
          professorId: usuario.id,
          tipo: corpo.tipo,
          // Horario autoritativo: gerado aqui, nunca recebido do cliente.
          timestampServidor: new Date(),
          latitude: corpo.latitude,
          longitude: corpo.longitude,
          distanciaDoCampusMetros: geocerca?.distanciaMetros ?? -1,
          precisaoMetros: corpo.precisao_metros ?? null,
          status: decisao.status,
          sincronizadoOffline: corpo.sincronizado_offline,
          registradoOfflineEm: corpo.registrado_offline_em
            ? new Date(corpo.registrado_offline_em)
            : null,
          campusId: geocerca?.campus.id ?? null,
        },
        include: { campus: true },
      });

      await registrarAuditoria(request, {
        acao: 'TENTATIVA_CHECKIN',
        resultado: decisao.status === 'VALIDADO' ? 'SUCESSO' : 'REJEITADO',
        professorId: usuario.id,
        registroId: registro.id,
        detalhes: {
          tipo: corpo.tipo,
          motivo: decisao.motivo,
          status: decisao.status,
          distancia_metros: Math.round(geocerca?.distanciaMetros ?? -1),
          campus: geocerca?.campus.nome ?? null,
          sincronizado_offline: corpo.sincronizado_offline,
        },
      });

      return reply.status(201).send({
        registro: registroParaDTO(registro),
        motivo: decisao.motivo,
        mensagem: decisao.mensagem,
      });
    },
  );

  /** Historico paginado do professor autenticado. */
  app.get(
    '/checkin/historico',
    { preHandler: exigirProfessor },
    async (request, reply) => {
      const usuario = usuarioAutenticado(request);
      const query = validar(historicoQuerySchema, request.query, 'query');

      const where = {
        professorId: usuario.id,
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(() => {
          const periodo = filtroPeriodo(
            query.data_inicio,
            query.data_fim,
            env.RELATORIO_TIMEZONE,
          );
          return periodo ? { timestampServidor: periodo } : {};
        })(),
      };

      const [total, registros] = await Promise.all([
        prisma.registroPonto.count({ where }),
        prisma.registroPonto.findMany({
          where,
          include: { campus: true },
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
    },
  );

  /**
   * Ultimo registro do professor e qual tipo ele pode registrar agora.
   * O app usa isso para habilitar/desabilitar os botoes de chegada e saida.
   */
  app.get(
    '/checkin/ultimo',
    { preHandler: exigirProfessor },
    async (request, reply) => {
      const usuario = usuarioAutenticado(request);

      const ultimo = await prisma.registroPonto.findFirst({
        where: { professorId: usuario.id, status: { not: 'REJEITADO' } },
        orderBy: { timestampServidor: 'desc' },
        include: { campus: true },
      });

      return reply.send({
        ultimo: ultimo ? registroParaDTO(ultimo) : null,
        proximo_tipo_esperado: proximoTipo(ultimo?.tipo ?? null),
      });
    },
  );
}

function proximoTipo(anterior: 'CHEGADA' | 'SAIDA' | null): 'CHEGADA' | 'SAIDA' {
  return anterior === 'CHEGADA' ? 'SAIDA' : 'CHEGADA';
}
