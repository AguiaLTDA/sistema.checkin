import type {
  RegistroPontoDTO,
  RelatorioJornada,
  RespostaPaginada,
} from '@univc/shared';
import { comQuery, requisitar } from './cliente';

export interface ProfessorResumo {
  id: string;
  nome: string;
  email: string;
  curso_vinculado: string;
  ativo: boolean;
}

export interface FiltrosRegistros {
  pagina?: number;
  por_pagina?: number;
  professor_id?: string;
  curso?: string;
  status?: string;
  tipo?: string;
  data_inicio?: string;
  data_fim?: string;
}

export function listarRegistros(
  filtros: FiltrosRegistros,
): Promise<RespostaPaginada<RegistroPontoDTO>> {
  return requisitar(comQuery('/admin/registros', { ...filtros }));
}

export function listarProfessores(): Promise<{ dados: ProfessorResumo[] }> {
  return requisitar('/admin/professores');
}

/** Gera uma senha temporaria para o professor e marca troca obrigatoria. */
export function redefinirSenhaProfessor(
  id: string,
): Promise<{ senha_temporaria: string }> {
  return requisitar(`/admin/professores/${id}/redefinir-senha`, {
    metodo: 'PATCH',
  });
}

export function listarCursos(): Promise<{ dados: string[] }> {
  return requisitar('/admin/cursos');
}

export function decidirRegistro(
  id: string,
  decisao: 'aprovar' | 'rejeitar',
  justificativa: string,
): Promise<{ registro: RegistroPontoDTO }> {
  return requisitar(`/admin/registros/${id}/${decisao}`, {
    metodo: 'PATCH',
    corpo: { justificativa_manual: justificativa },
  });
}

export function buscarRelatorioJornada(filtros: {
  data_inicio: string;
  data_fim: string;
  professor_id?: string;
  curso?: string;
}): Promise<RelatorioJornada> {
  return requisitar(comQuery('/admin/relatorio-jornada', { ...filtros }));
}
