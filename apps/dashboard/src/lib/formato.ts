import type { StatusRegistro } from '@univc/shared';

const FUSO = 'America/Sao_Paulo';

export function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatarDataCivil(dia: string): string {
  const [ano, mes, data] = dia.split('-');
  return `${data}/${mes}/${ano}`;
}

export function formatarDistancia(metros: number): string {
  if (metros < 0) return '—';
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

export const CORES_STATUS: Record<StatusRegistro, string> = {
  VALIDADO: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  PENDENTE_APROVACAO: 'bg-amber-100 text-amber-900 ring-amber-600/30',
  REJEITADO: 'bg-rose-100 text-rose-800 ring-rose-600/20',
};

/** Data de hoje (YYYY-MM-DD) no fuso do relatorio, para os filtros. */
export function hojeCivil(deslocamentoDias = 0): string {
  const data = new Date();
  data.setDate(data.getDate() + deslocamentoDias);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}
