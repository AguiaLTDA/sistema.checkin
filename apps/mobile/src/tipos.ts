/**
 * Contratos da API usados pelo app.
 *
 * O app fica fora do npm workspace da raiz (o Metro nao lida bem com pacotes
 * hoisted por symlink), entao estes tipos espelham `packages/shared` em vez de
 * importa-lo. Ao mudar o contrato da API, atualize os dois lugares.
 */

export type TipoRegistro = 'CHEGADA' | 'SAIDA';
export type StatusRegistro = 'VALIDADO' | 'PENDENTE_APROVACAO' | 'REJEITADO';

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: 'PROFESSOR' | 'ADMIN';
  curso_vinculado?: string;
}

export interface RespostaLogin {
  access_token: string;
  refresh_token: string;
  expira_em: number;
  usuario: UsuarioAutenticado;
}

export interface RegistroPontoDTO {
  id: string;
  tipo: TipoRegistro;
  timestamp_servidor: string;
  registrado_offline_em: string | null;
  latitude: number;
  longitude: number;
  distancia_do_campus_metros: number;
  status: StatusRegistro;
  sincronizado_offline: boolean;
  justificativa_manual: string | null;
  campus: { id: string; nome: string; raio_permitido_metros: number } | null;
  dentro_do_raio: boolean;
  criado_em: string;
}

export interface RespostaCheckin {
  registro: RegistroPontoDTO;
  motivo: string;
  mensagem: string;
}

export interface RespostaUltimo {
  ultimo: RegistroPontoDTO | null;
  proximo_tipo_esperado: TipoRegistro;
}

export interface RespostaHistorico {
  dados: RegistroPontoDTO[];
  paginacao: {
    pagina: number;
    por_pagina: number;
    total: number;
    total_paginas: number;
  };
}

/** Item aguardando envio na fila offline do aparelho. */
export interface RegistroPendente {
  id_local: string;
  tipo: TipoRegistro;
  latitude: number;
  longitude: number;
  precisao_metros?: number;
  /** Horario declarado pelo aparelho; o servidor mantem o proprio timestamp. */
  registrado_offline_em: string;
  tentativas: number;
  ultimo_erro?: string;
}

export const ROTULOS_STATUS: Record<StatusRegistro, string> = {
  VALIDADO: 'Validado',
  PENDENTE_APROVACAO: 'Pendente de aprovacao',
  REJEITADO: 'Rejeitado',
};

export const ROTULOS_TIPO: Record<TipoRegistro, string> = {
  CHEGADA: 'Chegada',
  SAIDA: 'Saida',
};
