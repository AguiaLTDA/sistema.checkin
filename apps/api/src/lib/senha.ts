import bcrypt from 'bcryptjs';

const CUSTO_BCRYPT = 10;

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/**
 * Hash descartavel usado quando o email informado no login nao existe. Comparar
 * contra ele mantem o tempo de resposta parecido com o de um usuario real,
 * evitando revelar quais emails estao cadastrados.
 */
export const HASH_FICTICIO =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.rV0lQ0k1sJmH0m3rN8XcQ9O3o2Wm';
