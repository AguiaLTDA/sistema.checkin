import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PapelUsuario } from '@univc/shared';
import { erroNaoAutenticado, erroSemPermissao } from '../lib/erros.js';
import { verificarAccessToken } from '../lib/tokens.js';
import { prisma } from '../prisma.js';

export interface UsuarioRequisicao {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioRequisicao;
  }
}

function extrairToken(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  if (!cabecalho?.startsWith('Bearer ')) {
    throw erroNaoAutenticado('Envie o token no cabecalho Authorization: Bearer <token>.');
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (!token) throw erroNaoAutenticado('Token de acesso ausente.');
  return token;
}

/**
 * preHandler que exige um professor ativo. Alem de validar a assinatura do JWT,
 * confere no banco se o professor continua ativo — um desligamento invalida a
 * sessao sem esperar o token expirar.
 */
export async function exigirProfessor(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const payload = verificarAccessToken(extrairToken(request));

  if (payload.papel !== 'PROFESSOR') {
    throw erroSemPermissao('Esta rota e exclusiva de professores.');
  }

  const professor = await prisma.professor.findUnique({
    where: { id: payload.sub },
    select: { id: true, nome: true, email: true, ativo: true },
  });

  if (!professor || !professor.ativo) {
    throw erroNaoAutenticado('Professor inativo ou inexistente.');
  }

  request.usuario = {
    id: professor.id,
    nome: professor.nome,
    email: professor.email,
    papel: 'PROFESSOR',
  };
}

/** preHandler que exige um admin (RH/coordenacao) ativo. */
export async function exigirAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const payload = verificarAccessToken(extrairToken(request));

  if (payload.papel !== 'ADMIN') {
    throw erroSemPermissao('Esta rota e exclusiva do RH/coordenacao.');
  }

  const admin = await prisma.admin.findUnique({
    where: { id: payload.sub },
    select: { id: true, nome: true, email: true, ativo: true },
  });

  if (!admin || !admin.ativo) {
    throw erroNaoAutenticado('Administrador inativo ou inexistente.');
  }

  request.usuario = {
    id: admin.id,
    nome: admin.nome,
    email: admin.email,
    papel: 'ADMIN',
  };
}

/** Usuario autenticado garantido (uso dentro de rotas ja protegidas). */
export function usuarioAutenticado(request: FastifyRequest): UsuarioRequisicao {
  if (!request.usuario) {
    throw erroNaoAutenticado('Requisicao sem usuario autenticado.');
  }
  return request.usuario;
}
