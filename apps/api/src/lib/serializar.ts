import type { Campus, Perfil, Professor, RegistroPonto } from '@prisma/client';
import type {
  PerfilDTO,
  RegistroPontoDTO,
  UsuarioAutenticado,
  UsuarioDTO,
} from '@univc/shared';

type ProfessorComPerfil = Professor & { perfil?: Perfil | null };

type RegistroCompleto = RegistroPonto & {
  campus?: Campus | null;
  professor?: ProfessorComPerfil | null;
};

/** Converte o registro do Prisma (camelCase) no DTO da API (snake_case). */
export function registroParaDTO(registro: RegistroCompleto): RegistroPontoDTO {
  const campus = registro.campus ?? null;

  return {
    id: registro.id,
    tipo: registro.tipo,
    timestamp_servidor: registro.timestampServidor.toISOString(),
    registrado_offline_em: registro.registradoOfflineEm?.toISOString() ?? null,
    latitude: registro.latitude,
    longitude: registro.longitude,
    distancia_do_campus_metros: Math.round(registro.distanciaDoCampusMetros),
    metodo_biometrico: registro.metodoBiometrico,
    status: registro.status,
    sincronizado_offline: registro.sincronizadoOffline,
    justificativa_manual: registro.justificativaManual,
    campus: campus
      ? {
          id: campus.id,
          nome: campus.nome,
          raio_permitido_metros: campus.raioPermitidoMetros,
        }
      : null,
    dentro_do_raio: campus
      ? registro.distanciaDoCampusMetros <= campus.raioPermitidoMetros
      : false,
    professor: registro.professor
      ? {
          id: registro.professor.id,
          nome: registro.professor.nome,
          email: registro.professor.email,
          curso_vinculado: registro.professor.cursoVinculado,
          perfil: registro.professor.perfil?.nome ?? null,
        }
      : undefined,
    criado_em: registro.createdAt.toISOString(),
  };
}

export function professorParaUsuario(
  professor: ProfessorComPerfil,
): UsuarioAutenticado {
  return {
    id: professor.id,
    nome: professor.nome,
    email: professor.email,
    papel: 'PROFESSOR',
    curso_vinculado: professor.cursoVinculado,
    perfil: professor.perfil?.nome ?? null,
  };
}

/** Cadastro do usuario como o RH ve. Nunca inclui o hash da senha. */
export function professorParaUsuarioDTO(professor: ProfessorComPerfil): UsuarioDTO {
  return {
    id: professor.id,
    nome: professor.nome,
    cpf: professor.cpf,
    email: professor.email,
    curso_vinculado: professor.cursoVinculado,
    perfil: professor.perfil
      ? { id: professor.perfil.id, nome: professor.perfil.nome }
      : null,
    ativo: professor.ativo,
    criado_em: professor.createdAt.toISOString(),
  };
}

export function perfilParaDTO(
  perfil: Perfil & { _count?: { usuarios: number } },
): PerfilDTO {
  return {
    id: perfil.id,
    nome: perfil.nome,
    descricao: perfil.descricao,
    ativo: perfil.ativo,
    total_usuarios: perfil._count?.usuarios ?? 0,
  };
}

export function adminParaUsuario(admin: {
  id: string;
  nome: string;
  email: string;
}): UsuarioAutenticado {
  return {
    id: admin.id,
    nome: admin.nome,
    email: admin.email,
    papel: 'ADMIN',
  };
}
