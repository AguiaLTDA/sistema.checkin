import type { Campus, Professor, RegistroPonto } from '@prisma/client';
import type { RegistroPontoDTO, UsuarioAutenticado } from '@univc/shared';

type RegistroCompleto = RegistroPonto & {
  campus?: Campus | null;
  professor?: Professor | null;
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
        }
      : undefined,
    criado_em: registro.createdAt.toISOString(),
  };
}

export function professorParaUsuario(professor: Professor): UsuarioAutenticado {
  return {
    id: professor.id,
    nome: professor.nome,
    email: professor.email,
    papel: 'PROFESSOR',
    curso_vinculado: professor.cursoVinculado,
    deve_trocar_senha: professor.deveTrocarSenha,
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
