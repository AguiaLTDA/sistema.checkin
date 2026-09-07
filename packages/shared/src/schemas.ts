import { z } from 'zod';
import { STATUS_REGISTRO, TIPOS_REGISTRO } from './enums.js';

/**
 * Contratos de entrada da API, em snake_case (formato do payload HTTP).
 *
 * O check-in e validado exclusivamente pela localizacao: latitude e longitude
 * sao obrigatorias e nao existe campo de biometria em nenhum schema.
 *
 * Observacao importante sobre horario: nenhum schema de check-in aceita um
 * campo de "horario do registro". O `timestamp_servidor` e sempre gerado pelo
 * backend com `now()`. Objetos zod descartam chaves desconhecidas por padrao,
 * entao um cliente que tentar enviar `timestamp` tem o campo simplesmente
 * ignorado. A unica excecao e `registrado_offline_em`, que existe apenas para
 * auditoria de registros feitos sem conexao e nunca substitui o timestamp do
 * servidor.
 */

export const latitudeSchema = z
  .number({ invalid_type_error: 'latitude deve ser um numero' })
  .min(-90, 'latitude fora do intervalo valido')
  .max(90, 'latitude fora do intervalo valido');

export const longitudeSchema = z
  .number({ invalid_type_error: 'longitude deve ser um numero' })
  .min(-180, 'longitude fora do intervalo valido')
  .max(180, 'longitude fora do intervalo valido');

// ---------------------------------------------------------------------------
// Autenticacao
// ---------------------------------------------------------------------------

export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('email invalido'),
  senha: z.string().min(6, 'senha deve ter ao menos 6 caracteres'),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z.object({
  refresh_token: z.string().min(10, 'refresh_token invalido'),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

/**
 * Corpo do PATCH /auth/senha. Exige a senha atual (a temporaria, no primeiro
 * acesso depois de um reset do RH, ou a de sempre numa troca voluntaria) para
 * confirmar que quem esta trocando e o proprio dono da conta.
 */
export const alterarSenhaBodySchema = z
  .object({
    senha_atual: z.string().min(6, 'senha_atual deve ter ao menos 6 caracteres'),
    senha_nova: z.string().min(6, 'senha_nova deve ter ao menos 6 caracteres'),
  })
  .refine((dados) => dados.senha_nova !== dados.senha_atual, {
    message: 'senha_nova deve ser diferente da senha_atual',
    path: ['senha_nova'],
  });
export type AlterarSenhaBody = z.infer<typeof alterarSenhaBodySchema>;

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/**
 * Corpo do POST /checkin. A presenca e comprovada apenas pela coordenada
 * enviada no momento do registro; latitude e longitude sao obrigatorias.
 */
export const checkinBodySchema = z
  .object({
    tipo: z.enum(TIPOS_REGISTRO),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    /** Precisao reportada pelo GPS do aparelho, em metros (opcional). */
    precisao_metros: z.number().nonnegative().max(100000).optional(),
    /** true quando o registro veio da fila offline do app. */
    sincronizado_offline: z.boolean().optional().default(false),
    /**
     * Momento declarado pelo aparelho para um registro feito offline.
     * Armazenado apenas para auditoria/relatorio; jamais vira timestamp_servidor.
     */
    registrado_offline_em: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (dados) => !dados.sincronizado_offline || Boolean(dados.registrado_offline_em),
    {
      message:
        'registrado_offline_em e obrigatorio quando sincronizado_offline e true',
      path: ['registrado_offline_em'],
    },
  );
export type CheckinBody = z.infer<typeof checkinBodySchema>;

const paginacaoSchema = {
  pagina: z.coerce.number().int().positive().default(1),
  por_pagina: z.coerce.number().int().positive().max(100).default(20),
};

const periodoSchema = {
  /** Data inicial inclusiva, formato YYYY-MM-DD ou ISO completo. */
  data_inicio: z.string().min(4).optional(),
  /** Data final inclusiva, formato YYYY-MM-DD ou ISO completo. */
  data_fim: z.string().min(4).optional(),
};

export const historicoQuerySchema = z.object({
  ...paginacaoSchema,
  ...periodoSchema,
  tipo: z.enum(TIPOS_REGISTRO).optional(),
  status: z.enum(STATUS_REGISTRO).optional(),
});
export type HistoricoQuery = z.infer<typeof historicoQuerySchema>;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminRegistrosQuerySchema = z.object({
  ...paginacaoSchema,
  ...periodoSchema,
  professor_id: z.string().uuid().optional(),
  curso: z.string().trim().min(1).optional(),
  tipo: z.enum(TIPOS_REGISTRO).optional(),
  status: z.enum(STATUS_REGISTRO).optional(),
});
export type AdminRegistrosQuery = z.infer<typeof adminRegistrosQuerySchema>;

export const decisaoManualBodySchema = z.object({
  justificativa_manual: z
    .string()
    .trim()
    .min(10, 'justificativa_manual deve ter ao menos 10 caracteres')
    .max(500, 'justificativa_manual deve ter no maximo 500 caracteres'),
});
export type DecisaoManualBody = z.infer<typeof decisaoManualBodySchema>;

export const relatorioJornadaQuerySchema = z.object({
  data_inicio: z.string().min(4, 'data_inicio e obrigatoria'),
  data_fim: z.string().min(4, 'data_fim e obrigatoria'),
  professor_id: z.string().uuid().optional(),
  curso: z.string().trim().min(1).optional(),
});
export type RelatorioJornadaQuery = z.infer<typeof relatorioJornadaQuerySchema>;

export const idParamSchema = z.object({
  id: z.string().uuid('id invalido'),
});

export const cpfSchema = z
  .string()
  .trim()
  .regex(/^\d{11}$/, 'cpf deve conter 11 digitos numericos');

/** Corpo do POST /admin/professores (cadastro de um novo professor pelo RH). */
export const professorCriarBodySchema = z.object({
  nome: z.string().trim().min(3, 'nome deve ter ao menos 3 caracteres').max(160),
  cpf: cpfSchema,
  email: z.string().trim().toLowerCase().email('email invalido'),
  curso_vinculado: z
    .string()
    .trim()
    .min(1, 'curso_vinculado e obrigatorio')
    .max(120),
});
export type ProfessorCriarBody = z.infer<typeof professorCriarBodySchema>;

/** Corpo do PATCH /admin/professores/:id (edicao de cadastro pelo RH). */
export const professorEditarBodySchema = z
  .object({
    nome: z.string().trim().min(3, 'nome deve ter ao menos 3 caracteres').max(160).optional(),
    cpf: cpfSchema.optional(),
    email: z.string().trim().toLowerCase().email('email invalido').optional(),
    curso_vinculado: z.string().trim().min(1).max(120).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type ProfessorEditarBody = z.infer<typeof professorEditarBodySchema>;
