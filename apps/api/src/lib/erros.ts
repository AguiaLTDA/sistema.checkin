/** Erro de aplicacao com status HTTP e codigo estavel para o cliente. */
export class ErroHttp extends Error {
  readonly statusCode: number;
  readonly codigo: string;
  readonly detalhes?: unknown;

  constructor(
    statusCode: number,
    codigo: string,
    mensagem: string,
    detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const erroValidacao = (mensagem: string, detalhes?: unknown) =>
  new ErroHttp(400, 'VALIDACAO', mensagem, detalhes);

export const erroNaoAutenticado = (mensagem = 'Credenciais invalidas ou ausentes.') =>
  new ErroHttp(401, 'NAO_AUTENTICADO', mensagem);

export const erroSemPermissao = (mensagem = 'Acesso negado para este perfil.') =>
  new ErroHttp(403, 'SEM_PERMISSAO', mensagem);

export const erroNaoEncontrado = (mensagem = 'Recurso nao encontrado.') =>
  new ErroHttp(404, 'NAO_ENCONTRADO', mensagem);

export const erroConflito = (mensagem: string, detalhes?: unknown) =>
  new ErroHttp(409, 'CONFLITO', mensagem, detalhes);
