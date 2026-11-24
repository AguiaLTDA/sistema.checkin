/**
 * Tipos das entidades persistidas na planilha. Substituem os tipos que antes
 * vinham gerados do `@prisma/client`, com os mesmos nomes de campo (camelCase)
 * para que as rotas nao precisem mudar.
 */

export type TipoRegistro = 'CHEGADA' | 'SAIDA';
export type StatusRegistro = 'VALIDADO' | 'PENDENTE_APROVACAO' | 'REJEITADO';
export type ResultadoAuditoria = 'SUCESSO' | 'REJEITADO' | 'ERRO';
export type AcaoAuditoria =
  | 'LOGIN_SUCESSO'
  | 'LOGIN_FALHA'
  | 'REFRESH_TOKEN'
  | 'LOGOUT'
  | 'TENTATIVA_CHECKIN'
  | 'APROVACAO_MANUAL'
  | 'REJEICAO_MANUAL'
  | 'REDEFINICAO_SENHA'
  | 'ALTERACAO_SENHA'
  | 'CRIACAO_PROFESSOR'
  | 'EDICAO_PROFESSOR'
  | 'EXCLUSAO_PROFESSOR'
  | 'PERFIL_CRIADO'
  | 'PERFIL_ATUALIZADO'
  | 'EDICAO_ADMIN';

export interface Professor {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  senhaHash: string;
  /** true logo depois que o RH redefine a senha; forca a troca no login. */
  deveTrocarSenha: boolean;
  cursoVinculado: string;
  perfilId: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Tipo de vinculo de quem bate ponto (Professor, Estagiario, Estudante...). */
export interface Perfil {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Admin {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Campus {
  id: string;
  nome: string;
  latitudeCentral: number;
  longitudeCentral: number;
  raioPermitidoMetros: number;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistroPonto {
  id: string;
  professorId: string;
  tipo: TipoRegistro;
  /** Horario autoritativo, sempre gerado pelo backend. */
  timestampServidor: Date;
  latitude: number;
  longitude: number;
  distanciaDoCampusMetros: number;
  precisaoMetros: number | null;
  status: StatusRegistro;
  sincronizadoOffline: boolean;
  /** Horario declarado pelo aparelho num registro offline; so auditoria. */
  registradoOfflineEm: Date | null;
  justificativaManual: string | null;
  campusId: string | null;
  decididoPor: string | null;
  decididoEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  tokenHash: string;
  professorId: string | null;
  adminId: string | null;
  expiraEm: Date;
  revogadoEm: Date | null;
  createdAt: Date;
}

export interface LogAuditoria {
  id: string;
  acao: AcaoAuditoria;
  resultado: ResultadoAuditoria;
  professorId: string | null;
  adminId: string | null;
  registroId: string | null;
  /** Detalhes nao sensiveis do evento. Nunca contem credenciais. */
  detalhes: unknown;
  ip: string | null;
  userAgent: string | null;
  criadoEm: Date;
}
