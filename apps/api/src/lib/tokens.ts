import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PapelUsuario } from '@univc/shared';
import { env } from '../env.js';
import { erroNaoAutenticado } from './erros.js';

export interface PayloadAcesso {
  sub: string;
  papel: PapelUsuario;
  nome: string;
  email: string;
}

interface PayloadRefresh {
  sub: string;
  papel: PapelUsuario;
  jti: string;
  tipo: 'refresh';
}

export function gerarAccessToken(payload: PayloadAcesso): string {
  // `sub` vai no proprio payload; nao usar tambem `options.subject`, que o
  // jsonwebtoken considera conflito e rejeita.
  return jwt.sign({ ...payload, tipo: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

export interface RefreshGerado {
  token: string;
  hash: string;
  expiraEm: Date;
}

/**
 * Gera o refresh token (JWT assinado com segredo proprio) e o hash SHA-256 que
 * fica no banco. Guardar apenas o hash permite revogar o token sem armazenar o
 * valor utilizavel.
 */
export function gerarRefreshToken(
  sub: string,
  papel: PapelUsuario,
): RefreshGerado {
  const jti = randomUUID();
  const token = jwt.sign({ sub, papel, jti, tipo: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as jwt.SignOptions);

  const decodificado = jwt.decode(token) as { exp?: number } | null;
  const expiraEm = decodificado?.exp
    ? new Date(decodificado.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return { token, hash: hashToken(token), expiraEm };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verificarAccessToken(token: string): PayloadAcesso {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as PayloadAcesso & {
      tipo?: string;
    };
    if (payload.tipo !== 'access') {
      throw erroNaoAutenticado('Token de tipo incorreto.');
    }
    return payload;
  } catch (erro) {
    if (erro instanceof jwt.TokenExpiredError) {
      throw erroNaoAutenticado('Sessao expirada. Faca login novamente.');
    }
    throw erroNaoAutenticado('Token de acesso invalido.');
  }
}

export function verificarRefreshToken(token: string): PayloadRefresh {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as PayloadRefresh;
    if (payload.tipo !== 'refresh') {
      throw erroNaoAutenticado('Token de tipo incorreto.');
    }
    return payload;
  } catch (erro) {
    if (erro instanceof jwt.TokenExpiredError) {
      throw erroNaoAutenticado('Refresh token expirado. Faca login novamente.');
    }
    throw erroNaoAutenticado('Refresh token invalido.');
  }
}

/** Segundos de validade do access token, para o cliente agendar o refresh. */
export function segundosDeAcesso(): number {
  const token = jwt.sign({ x: 1 }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
  const decodificado = jwt.decode(token) as { exp?: number; iat?: number } | null;
  if (!decodificado?.exp || !decodificado.iat) return 900;
  return decodificado.exp - decodificado.iat;
}
