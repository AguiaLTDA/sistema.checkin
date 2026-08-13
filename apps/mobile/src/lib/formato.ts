import type { StatusRegistro } from '../tipos';

const FUSO = 'America/Sao_Paulo';

export function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatarDistancia(metros: number): string {
  if (metros < 0) return 'sem campus de referencia';
  if (metros < 1000) return `${Math.round(metros)} m do campus`;
  return `${(metros / 1000).toFixed(1)} km do campus`;
}

export const CORES = {
  primaria: '#1B4F7D',
  primariaEscura: '#0F2F4F',
  chegada: '#047857',
  saida: '#0369A1',
  fundo: '#F1F5F9',
  texto: '#1E293B',
  textoFraco: '#64748B',
  borda: '#E2E8F0',
  branco: '#FFFFFF',
} as const;

export const CORES_STATUS: Record<
  StatusRegistro,
  { fundo: string; texto: string }
> = {
  VALIDADO: { fundo: '#D1FAE5', texto: '#065F46' },
  PENDENTE_APROVACAO: { fundo: '#FEF3C7', texto: '#78350F' },
  REJEITADO: { fundo: '#FFE4E6', texto: '#9F1239' },
};
