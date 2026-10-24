import type {
  AtualizarPerfilBody,
  AtualizarUsuarioBody,
  CriarPerfilBody,
  CriarUsuarioBody,
  PerfilDTO,
  RegistroPontoDTO,
  RelatorioJornada,
  RespostaPaginada,
  UsuarioDTO,
} from '@univc/shared';
import { comQuery, requisitar } from './cliente';

export interface ProfessorResumo {
  id: string;
  nome: string;
  email: string;
  curso_vinculado: string;
  ativo: boolean;
  perfil: string | null;
}

export interface FiltrosRegistros {
  pagina?: number;
  por_pagina?: number;
  professor_id?: string;
  curso?: string;
  perfil_id?: string;
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
  perfil_id?: string;
}): Promise<RelatorioJornada> {
  return requisitar(comQuery('/admin/relatorio-jornada', { ...filtros }));
}

// ---------------------------------------------------------------------------
// Cadastro de usuarios e perfis
// ---------------------------------------------------------------------------

export function listarPerfis(): Promise<{ dados: PerfilDTO[] }> {
  return requisitar('/admin/perfis');
}

export function criarPerfil(corpo: CriarPerfilBody): Promise<{ perfil: PerfilDTO }> {
  return requisitar('/admin/perfis', { metodo: 'POST', corpo });
}

export function atualizarPerfil(
  id: string,
  corpo: AtualizarPerfilBody,
): Promise<{ perfil: PerfilDTO }> {
  return requisitar(`/admin/perfis/${id}`, { metodo: 'PATCH', corpo });
}

export function listarUsuarios(): Promise<{ dados: UsuarioDTO[] }> {
  return requisitar('/admin/usuarios');
}

export function criarUsuario(corpo: CriarUsuarioBody): Promise<{ usuario: UsuarioDTO }> {
  return requisitar('/admin/usuarios', { metodo: 'POST', corpo });
}

export function atualizarUsuario(
  id: string,
  corpo: AtualizarUsuarioBody,
): Promise<{ usuario: UsuarioDTO }> {
  return requisitar(`/admin/usuarios/${id}`, { metodo: 'PATCH', corpo });
}
