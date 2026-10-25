/**
 * Enums do dominio, compartilhados entre API, dashboard e app mobile.
 * Os valores sao identicos aos enums do Prisma (apps/api/prisma/schema.prisma).
 */

export const TIPOS_REGISTRO = ['CHEGADA', 'SAIDA'] as const;
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number];

export const STATUS_REGISTRO = ['VALIDADO', 'PENDENTE_APROVACAO', 'REJEITADO'] as const;
export type StatusRegistro = (typeof STATUS_REGISTRO)[number];

export const PAPEIS_USUARIO = ['PROFESSOR', 'ADMIN'] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];

export const TIPOS_INCONSISTENCIA = [
  'CHEGADA_SEM_SAIDA',
  'SAIDA_SEM_CHEGADA',
  'CHEGADA_DUPLICADA',
  'REGISTRO_PENDENTE',
] as const;
export type TipoInconsistencia = (typeof TIPOS_INCONSISTENCIA)[number];

export const ROTULOS_STATUS: Record<StatusRegistro, string> = {
  VALIDADO: 'Validado',
  PENDENTE_APROVACAO: 'Pendente de aprovacao',
  REJEITADO: 'Rejeitado',
};

export const ROTULOS_TIPO: Record<TipoRegistro, string> = {
  CHEGADA: 'Chegada',
  SAIDA: 'Saida',
};

export const ROTULOS_INCONSISTENCIA: Record<TipoInconsistencia, string> = {
  CHEGADA_SEM_SAIDA: 'Chegada sem saida correspondente',
  SAIDA_SEM_CHEGADA: 'Saida sem chegada correspondente',
  CHEGADA_DUPLICADA: 'Duas chegadas seguidas sem saida no meio',
  REGISTRO_PENDENTE: 'Ha registro pendente de aprovacao no dia',
};
