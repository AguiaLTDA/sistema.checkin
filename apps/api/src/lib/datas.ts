import { erroValidacao } from './erros.js';

/**
 * Conversao entre datas civis (YYYY-MM-DD no fuso do relatorio) e instantes
 * UTC, sem dependencia externa: o offset do fuso e obtido via Intl, o que ja
 * cobre horario de verao.
 */

const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Offset do fuso, em minutos, no instante informado (positivo a leste). */
function offsetMinutos(instante: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? '0');

  // `hour` pode vir como 24 em algumas engines para meia-noite com hour12:false.
  const hora = valor('hour') % 24;

  const comoSeFosseUtc = Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    hora,
    valor('minute'),
    valor('second'),
  );

  return (comoSeFosseUtc - instante.getTime()) / 60_000;
}

/** Instante UTC correspondente a meia-noite civil de `YYYY-MM-DD` no fuso. */
export function inicioDoDia(dataCivil: string, timezone: string): Date {
  const partes = FORMATO_DATA.exec(dataCivil);
  if (!partes) {
    throw erroValidacao(`Data "${dataCivil}" deve estar no formato YYYY-MM-DD.`);
  }

  const [, ano, mes, dia] = partes;
  const meiaNoiteUtc = Date.UTC(Number(ano), Number(mes) - 1, Number(dia));

  // Duas passadas: a primeira estima o offset, a segunda corrige o caso em que
  // a estimativa cai do outro lado de uma virada de horario de verao.
  let instante = meiaNoiteUtc - offsetMinutos(new Date(meiaNoiteUtc), timezone) * 60_000;
  instante = meiaNoiteUtc - offsetMinutos(new Date(instante), timezone) * 60_000;

  return new Date(instante);
}

/** Instante UTC do inicio do dia seguinte: limite superior exclusivo. */
export function fimDoDiaExclusivo(dataCivil: string, timezone: string): Date {
  const inicio = inicioDoDia(dataCivil, timezone);
  const proximo = new Date(inicio.getTime() + 26 * 60 * 60 * 1000);
  const chaveProxima = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(proximo);
  return inicioDoDia(chaveProxima, timezone);
}

/**
 * Aceita `YYYY-MM-DD` (interpretado no fuso do relatorio) ou um ISO completo.
 * `limite: 'fim'` transforma uma data civil no fim do dia (exclusivo).
 */
export function interpretarData(
  valor: string,
  timezone: string,
  limite: 'inicio' | 'fim' = 'inicio',
): Date {
  if (FORMATO_DATA.test(valor)) {
    return limite === 'inicio'
      ? inicioDoDia(valor, timezone)
      : fimDoDiaExclusivo(valor, timezone);
  }

  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) {
    throw erroValidacao(`Data "${valor}" invalida. Use YYYY-MM-DD ou ISO 8601.`);
  }
  return instante;
}

/**
 * Monta o filtro de periodo do Prisma para `timestampServidor`.
 * `data_fim` e sempre tratada como limite exclusivo (inicio do dia seguinte).
 */
export function filtroPeriodo(
  dataInicio: string | undefined,
  dataFim: string | undefined,
  timezone: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!dataInicio && !dataFim) return undefined;

  const filtro: { gte?: Date; lt?: Date } = {};
  if (dataInicio) filtro.gte = interpretarData(dataInicio, timezone, 'inicio');
  if (dataFim) filtro.lt = interpretarData(dataFim, timezone, 'fim');

  if (filtro.gte && filtro.lt && filtro.gte >= filtro.lt) {
    throw erroValidacao('data_inicio deve ser anterior a data_fim.');
  }

  return filtro;
}
