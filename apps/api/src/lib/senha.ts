import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

const CUSTO_BCRYPT = 10;

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/// Sem 0/O/1/I/l nem outros caracteres que se confundem ao ditar por telefone
/// ou digitar de um bilhete escrito a mao.
const ALFABETO_SENHA_TEMPORARIA = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/**
 * Gera uma senha temporaria legivel, usada quando o RH redefine a senha de um
 * professor (PATCH /admin/professores/:id/redefinir-senha). E devolvida em
 * texto puro uma unica vez, na resposta daquela chamada — o RH repassa ao
 * professor por fora do sistema (telefone, presencial etc.); nada disso fica
 * gravado, so o hash.
 */
export function gerarSenhaTemporaria(tamanho = 10): string {
  let senha = '';
  for (let i = 0; i < tamanho; i += 1) {
    senha += ALFABETO_SENHA_TEMPORARIA[randomInt(ALFABETO_SENHA_TEMPORARIA.length)];
  }
  return senha;
}

/**
 * Hash descartavel usado quando o email informado no login nao existe. Comparar
 * contra ele mantem o tempo de resposta parecido com o de um usuario real,
 * evitando revelar quais emails estao cadastrados.
 */
export const HASH_FICTICIO =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.rV0lQ0k1sJmH0m3rN8XcQ9O3o2Wm';
