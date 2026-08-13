import type { ZodTypeAny, z } from 'zod';
import { erroValidacao } from './erros.js';

/**
 * Valida um payload com zod e converte a falha em ErroHttp 400 com a lista de
 * problemas por campo. Usado no inicio de cada handler, mantendo a validacao
 * explicita e proxima da rota.
 */
export function validar<T extends ZodTypeAny>(
  schema: T,
  dados: unknown,
  origem: 'corpo' | 'query' | 'parametros' = 'corpo',
): z.infer<T> {
  const resultado = schema.safeParse(dados);

  if (!resultado.success) {
    throw erroValidacao(
      `Dados invalidos no ${origem} da requisicao.`,
      resultado.error.issues.map((issue) => ({
        campo: issue.path.join('.') || '(raiz)',
        mensagem: issue.message,
      })),
    );
  }

  return resultado.data;
}
