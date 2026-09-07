import type { StatusRegistro } from '@univc/shared';
import type { AvaliacaoGeocerca } from './geo.js';

/**
 * Regra de decisao do status de um registro de ponto.
 *
 * O unico criterio de presenca e a localizacao: dentro do raio do campus ->
 * VALIDADO; fora do raio -> PENDENTE_APROVACAO. Alem dela, tratamos como
 * pendentes duas situacoes em que o servidor nao consegue confirmar a presenca
 * por conta propria:
 *
 *  - nenhum campus cadastrado (nao ha geocerca contra a qual comparar);
 *  - registro vindo da fila offline, porque o servidor nao tem como atestar o
 *    momento em que o professor realmente estava no campus.
 *
 * REJEITADO nunca e atribuido automaticamente: e sempre uma decisao manual do
 * RH pela rota /admin/registros/:id/rejeitar.
 */

export type MotivoStatus =
  | 'DENTRO_DO_RAIO'
  | 'FORA_DO_RAIO'
  | 'SEM_CAMPUS_CADASTRADO'
  | 'REGISTRO_OFFLINE';

export interface EntradaDecisao {
  geocerca: AvaliacaoGeocerca | null;
  sincronizadoOffline: boolean;
}

export interface DecisaoStatus {
  status: StatusRegistro;
  motivo: MotivoStatus;
  mensagem: string;
}

const MENSAGENS: Record<MotivoStatus, string> = {
  DENTRO_DO_RAIO: 'Registro validado: voce esta dentro do raio do campus.',
  FORA_DO_RAIO:
    'Voce esta fora do raio permitido do campus. O registro foi enviado para aprovacao do RH.',
  SEM_CAMPUS_CADASTRADO:
    'Nenhum campus cadastrado para validar a localizacao. O registro foi enviado para aprovacao do RH.',
  REGISTRO_OFFLINE:
    'Registro sincronizado apos uso offline. O horario declarado precisa de conferencia do RH.',
};

export function decidirStatus(entrada: EntradaDecisao): DecisaoStatus {
  const motivo = determinarMotivo(entrada);

  return {
    status: motivo === 'DENTRO_DO_RAIO' ? 'VALIDADO' : 'PENDENTE_APROVACAO',
    motivo,
    mensagem: MENSAGENS[motivo],
  };
}

function determinarMotivo(entrada: EntradaDecisao): MotivoStatus {
  if (entrada.geocerca === null) return 'SEM_CAMPUS_CADASTRADO';
  if (!entrada.geocerca.dentroDoRaio) return 'FORA_DO_RAIO';
  if (entrada.sincronizadoOffline) return 'REGISTRO_OFFLINE';
  return 'DENTRO_DO_RAIO';
}

/**
 * Impede dois registros do mesmo tipo em sequencia (duas chegadas sem saida no
 * meio, ou duas saidas seguidas). Registros REJEITADOS nao contam como ultimo
 * registro valido.
 */
export function sequenciaValida(
  tipoAnterior: 'CHEGADA' | 'SAIDA' | null,
  tipoNovo: 'CHEGADA' | 'SAIDA',
): boolean {
  if (tipoAnterior === null) return tipoNovo === 'CHEGADA';
  return tipoAnterior !== tipoNovo;
}
