import type { AcaoAuditoria, ResultadoAuditoria } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../prisma.js';

export interface EntradaAuditoria {
  acao: AcaoAuditoria;
  resultado: ResultadoAuditoria;
  professorId?: string | null;
  adminId?: string | null;
  registroId?: string | null;
  /**
   * Detalhes nao sensiveis do evento. Nunca inclua senha nem token. O sistema
   * nao coleta biometria em nenhuma etapa (ver README, secao LGPD).
   */
  detalhes?: Record<string, unknown>;
}

/**
 * Grava a trilha de auditoria. Toda tentativa de check-in passa por aqui,
 * inclusive as rejeitadas e as que falham na validacao.
 *
 * Nunca lanca: uma falha de auditoria e registrada no log da aplicacao mas nao
 * derruba a requisicao do professor.
 */
export async function registrarAuditoria(
  request: FastifyRequest,
  entrada: EntradaAuditoria,
): Promise<void> {
  try {
    await prisma.logAuditoria.create({
      data: {
        acao: entrada.acao,
        resultado: entrada.resultado,
        professorId: entrada.professorId ?? null,
        adminId: entrada.adminId ?? null,
        registroId: entrada.registroId ?? null,
        detalhes: (entrada.detalhes ?? {}) as object,
        ip: request.ip?.slice(0, 64) ?? null,
        userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
      },
    });
  } catch (erro) {
    request.log.error({ erro }, 'falha ao gravar log de auditoria');
  }
}
