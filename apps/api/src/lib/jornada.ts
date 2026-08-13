import type {
  InconsistenciaJornada,
  JornadaDia,
  ParJornada,
  StatusRegistro,
  TipoRegistro,
} from '@univc/shared';
import { ROTULOS_INCONSISTENCIA } from '@univc/shared';

/**
 * Calculo de jornada: pareia CHEGADA com SAIDA dentro de cada dia, soma as
 * horas trabalhadas e aponta inconsistencias. Modulo puro, testado em
 * tests/unit/jornada.test.ts.
 */

export interface RegistroJornada {
  id: string;
  tipo: TipoRegistro;
  status: StatusRegistro;
  /**
   * Momento considerado para o relatorio. Para registros online e o
   * `timestampServidor`; para registros sincronizados offline usamos o horario
   * declarado pelo aparelho, que fica marcado como inconsistencia ate o RH
   * aprovar.
   */
  momento: Date;
}

/** Chave YYYY-MM-DD do dia no fuso informado. */
export function chaveDoDia(momento: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento);
}

/** Converte minutos em "HH:MM" (aceita mais de 24 horas). */
export function formatarHoras(minutos: number): string {
  const totalMinutos = Math.max(0, Math.round(minutos));
  const horas = Math.floor(totalMinutos / 60);
  const resto = totalMinutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

function inconsistencia(
  tipo: InconsistenciaJornada['tipo'],
  registroId: string | null,
): InconsistenciaJornada {
  return { tipo, descricao: ROTULOS_INCONSISTENCIA[tipo], registro_id: registroId };
}

/**
 * Agrupa os registros por dia (no fuso informado) e pareia chegadas com saidas
 * na ordem cronologica.
 *
 * Registros REJEITADOS sao descartados: nao contam horas nem geram
 * inconsistencia. Registros PENDENTE_APROVACAO entram no calculo, mas marcam o
 * dia com a inconsistencia REGISTRO_PENDENTE para o RH conferir.
 */
export function calcularJornada(
  registros: readonly RegistroJornada[],
  timezone: string,
): JornadaDia[] {
  const porDia = new Map<string, RegistroJornada[]>();

  for (const registro of registros) {
    if (registro.status === 'REJEITADO') continue;
    const chave = chaveDoDia(registro.momento, timezone);
    const lista = porDia.get(chave);
    if (lista) lista.push(registro);
    else porDia.set(chave, [registro]);
  }

  const dias: JornadaDia[] = [];

  for (const chave of [...porDia.keys()].sort()) {
    const doDia = [...(porDia.get(chave) ?? [])].sort(
      (a, b) => a.momento.getTime() - b.momento.getTime(),
    );

    const pares: ParJornada[] = [];
    const inconsistencias: InconsistenciaJornada[] = [];
    let minutosTrabalhados = 0;
    let chegadaPendente: RegistroJornada | null = null;

    for (const registro of doDia) {
      if (registro.tipo === 'CHEGADA') {
        if (chegadaPendente) {
          // Duas chegadas seguidas: a primeira fica sem par.
          pares.push({
            chegada: paraLado(chegadaPendente),
            saida: null,
            minutos_trabalhados: null,
          });
          inconsistencias.push(
            inconsistencia('CHEGADA_DUPLICADA', registro.id),
          );
        }
        chegadaPendente = registro;
        continue;
      }

      if (!chegadaPendente) {
        pares.push({
          chegada: null,
          saida: paraLado(registro),
          minutos_trabalhados: null,
        });
        inconsistencias.push(inconsistencia('SAIDA_SEM_CHEGADA', registro.id));
        continue;
      }

      const minutos = Math.max(
        0,
        Math.round(
          (registro.momento.getTime() - chegadaPendente.momento.getTime()) /
            60_000,
        ),
      );
      minutosTrabalhados += minutos;
      pares.push({
        chegada: paraLado(chegadaPendente),
        saida: paraLado(registro),
        minutos_trabalhados: minutos,
      });
      chegadaPendente = null;
    }

    if (chegadaPendente) {
      pares.push({
        chegada: paraLado(chegadaPendente),
        saida: null,
        minutos_trabalhados: null,
      });
      inconsistencias.push(
        inconsistencia('CHEGADA_SEM_SAIDA', chegadaPendente.id),
      );
    }

    const pendente = doDia.find((r) => r.status === 'PENDENTE_APROVACAO');
    if (pendente) {
      inconsistencias.push(inconsistencia('REGISTRO_PENDENTE', pendente.id));
    }

    dias.push({
      data: chave,
      pares,
      minutos_trabalhados: minutosTrabalhados,
      horas_trabalhadas: formatarHoras(minutosTrabalhados),
      inconsistencias,
    });
  }

  return dias;
}

function paraLado(registro: RegistroJornada): NonNullable<ParJornada['chegada']> {
  return {
    id: registro.id,
    horario: registro.momento.toISOString(),
    status: registro.status,
  };
}
