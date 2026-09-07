import type {
  PapelUsuario,
  StatusRegistro,
  TipoInconsistencia,
  TipoRegistro,
} from './enums.js';

/** Formato de erro devolvido por toda a API. */
export interface ErroApi {
  erro: string;
  mensagem: string;
  detalhes?: unknown;
}

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  /** Presente apenas quando papel === 'PROFESSOR'. */
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
  /** Horario autoritativo, sempre gerado pelo servidor. */
  timestamp_servidor: string;
  /** Momento declarado pelo aparelho para registros feitos offline. */
  registrado_offline_em: string | null;
  latitude: number;
  longitude: number;
  distancia_do_campus_metros: number;
  status: StatusRegistro;
  sincronizado_offline: boolean;
  justificativa_manual: string | null;
  campus: { id: string; nome: string; raio_permitido_metros: number } | null;
  dentro_do_raio: boolean;
  professor?: {
    id: string;
    nome: string;
    email: string;
    curso_vinculado: string;
  };
  criado_em: string;
}

export interface RespostaPaginada<T> {
  dados: T[];
  paginacao: {
    pagina: number;
    por_pagina: number;
    total: number;
    total_paginas: number;
  };
}

export interface ParJornada {
  chegada: { id: string; horario: string; status: StatusRegistro } | null;
  saida: { id: string; horario: string; status: StatusRegistro } | null;
  minutos_trabalhados: number | null;
}

export interface InconsistenciaJornada {
  tipo: TipoInconsistencia;
  descricao: string;
  registro_id: string | null;
}

export interface JornadaDia {
  data: string;
  pares: ParJornada[];
  minutos_trabalhados: number;
  horas_trabalhadas: string;
  inconsistencias: InconsistenciaJornada[];
}

export interface JornadaProfessor {
  professor: {
    id: string;
    nome: string;
    email: string;
    curso_vinculado: string;
  };
  dias: JornadaDia[];
  minutos_trabalhados_total: number;
  horas_trabalhadas_total: string;
  total_inconsistencias: number;
}

export interface RelatorioJornada {
  periodo: { data_inicio: string; data_fim: string; timezone: string };
  professores: JornadaProfessor[];
}

export interface CampusDTO {
  id: string;
  nome: string;
  latitude_central: number;
  longitude_central: number;
  raio_permitido_metros: number;
}
