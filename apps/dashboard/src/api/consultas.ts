import type {
  RegistroPontoDTO,
  RelatorioJornada,
  RespostaPaginada,
} from '@univc/shared';
import { comQuery, requisitar } from './cliente';

export interface ProfessorResumo {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  curso_vinculado: string;
  ativo: boolean;
}

export interface ProfessorFormulario {
  nome: string;
  cpf: string;
  email: string;
  curso_vinculado: string;
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
  // corpo: {} (nao undefined) para o fetch mandar Content-Type: application/json —
  // sem isso o navegador manda Content-Length: 0 sem content-type, e o Fastify
  // recusa com 415 (o corpo vazio, sem tipo declarado, nao casa com nenhum parser).
  return requisitar(`/admin/professores/${id}/redefinir-senha`, {
    metodo: 'PATCH',
    corpo: {},
  });
}

/** Cadastra um novo professor. Devolve a senha temporaria gerada, uma unica vez. */
export function criarProfessor(
  dados: ProfessorFormulario,
): Promise<{ professor: ProfessorResumo; senha_temporaria: string }> {
  return requisitar('/admin/professores', {
    metodo: 'POST',
    corpo: dados,
  });
}

/** Edita o cadastro de um professor (nao mexe em senha). */
export function editarProfessor(
  id: string,
  dados: Partial<ProfessorFormulario> & { ativo?: boolean },
): Promise<{ professor: ProfessorResumo }> {
  return requisitar(`/admin/professores/${id}`, {
    metodo: 'PATCH',
    corpo: dados,
  });
}

/** Apaga definitivamente um professor (e seus registros de ponto, em cascata). */
export function apagarProfessor(id: string): Promise<void> {
  return requisitar(`/admin/professores/${id}`, { metodo: 'DELETE' });
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
