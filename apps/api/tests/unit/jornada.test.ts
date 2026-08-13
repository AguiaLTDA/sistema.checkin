import { describe, expect, it } from 'vitest';
import {
  type RegistroJornada,
  calcularJornada,
  chaveDoDia,
  formatarHoras,
} from '../../src/lib/jornada.js';

const TZ = 'America/Sao_Paulo';

let contador = 0;
function registro(
  tipo: 'CHEGADA' | 'SAIDA',
  iso: string,
  status: RegistroJornada['status'] = 'VALIDADO',
): RegistroJornada {
  contador += 1;
  return { id: `reg-${contador}`, tipo, status, momento: new Date(iso) };
}

describe('formatarHoras', () => {
  it('formata minutos como HH:MM', () => {
    expect(formatarHoras(0)).toBe('00:00');
    expect(formatarHoras(90)).toBe('01:30');
    expect(formatarHoras(485)).toBe('08:05');
  });

  it('passa das 24 horas sem estourar', () => {
    expect(formatarHoras(1_500)).toBe('25:00');
  });

  it('trata minutos negativos como zero', () => {
    expect(formatarHoras(-30)).toBe('00:00');
  });
});

describe('chaveDoDia', () => {
  it('agrupa pelo dia civil no fuso do relatorio, e nao em UTC', () => {
    // 02:00 UTC de 11/03 e ainda 23:00 de 10/03 em Sao Paulo (UTC-3).
    expect(chaveDoDia(new Date('2026-03-11T02:00:00Z'), TZ)).toBe('2026-03-10');
    expect(chaveDoDia(new Date('2026-03-11T12:00:00Z'), TZ)).toBe('2026-03-11');
  });
});

describe('calcularJornada', () => {
  it('pareia chegada com saida e soma as horas trabalhadas', () => {
    const dias = calcularJornada(
      [
        registro('CHEGADA', '2026-03-10T11:00:00Z'), // 08:00 local
        registro('SAIDA', '2026-03-10T15:30:00Z'), // 12:30 local
      ],
      TZ,
    );

    expect(dias).toHaveLength(1);
    expect(dias[0]?.data).toBe('2026-03-10');
    expect(dias[0]?.minutos_trabalhados).toBe(270);
    expect(dias[0]?.horas_trabalhadas).toBe('04:30');
    expect(dias[0]?.inconsistencias).toHaveLength(0);
    expect(dias[0]?.pares).toHaveLength(1);
  });

  it('soma dois turnos no mesmo dia', () => {
    const dias = calcularJornada(
      [
        registro('CHEGADA', '2026-03-10T11:00:00Z'),
        registro('SAIDA', '2026-03-10T15:00:00Z'),
        registro('CHEGADA', '2026-03-10T19:00:00Z'),
        registro('SAIDA', '2026-03-10T22:00:00Z'),
      ],
      TZ,
    );

    expect(dias[0]?.pares).toHaveLength(2);
    expect(dias[0]?.minutos_trabalhados).toBe(420);
    expect(dias[0]?.horas_trabalhadas).toBe('07:00');
  });

  it('separa os registros por dia', () => {
    const dias = calcularJornada(
      [
        registro('CHEGADA', '2026-03-10T11:00:00Z'),
        registro('SAIDA', '2026-03-10T15:00:00Z'),
        registro('CHEGADA', '2026-03-11T11:00:00Z'),
        registro('SAIDA', '2026-03-11T14:00:00Z'),
      ],
      TZ,
    );

    expect(dias.map((dia) => dia.data)).toEqual(['2026-03-10', '2026-03-11']);
    expect(dias[0]?.minutos_trabalhados).toBe(240);
    expect(dias[1]?.minutos_trabalhados).toBe(180);
  });

  it('sinaliza chegada sem saida correspondente', () => {
    const dias = calcularJornada(
      [registro('CHEGADA', '2026-03-10T11:00:00Z')],
      TZ,
    );

    expect(dias[0]?.minutos_trabalhados).toBe(0);
    expect(dias[0]?.inconsistencias.map((i) => i.tipo)).toEqual([
      'CHEGADA_SEM_SAIDA',
    ]);
    expect(dias[0]?.pares[0]?.saida).toBeNull();
  });

  it('sinaliza saida sem chegada correspondente', () => {
    const dias = calcularJornada(
      [registro('SAIDA', '2026-03-10T15:00:00Z')],
      TZ,
    );

    expect(dias[0]?.minutos_trabalhados).toBe(0);
    expect(dias[0]?.inconsistencias.map((i) => i.tipo)).toEqual([
      'SAIDA_SEM_CHEGADA',
    ]);
    expect(dias[0]?.pares[0]?.chegada).toBeNull();
  });

  it('sinaliza duas chegadas seguidas e nao conta a primeira', () => {
    const dias = calcularJornada(
      [
        registro('CHEGADA', '2026-03-10T11:00:00Z'),
        registro('CHEGADA', '2026-03-10T12:00:00Z'),
        registro('SAIDA', '2026-03-10T15:00:00Z'),
      ],
      TZ,
    );

    expect(dias[0]?.inconsistencias.map((i) => i.tipo)).toContain(
      'CHEGADA_DUPLICADA',
    );
    // Contam apenas as 3 h entre a segunda chegada e a saida.
    expect(dias[0]?.minutos_trabalhados).toBe(180);
  });

  it('ordena registros fora de ordem antes de parear', () => {
    const dias = calcularJornada(
      [
        registro('SAIDA', '2026-03-10T15:00:00Z'),
        registro('CHEGADA', '2026-03-10T11:00:00Z'),
      ],
      TZ,
    );

    expect(dias[0]?.inconsistencias).toHaveLength(0);
    expect(dias[0]?.minutos_trabalhados).toBe(240);
  });

  it('ignora registros rejeitados pelo RH', () => {
    const dias = calcularJornada(
      [
        registro('CHEGADA', '2026-03-10T11:00:00Z'),
        registro('CHEGADA', '2026-03-10T12:00:00Z', 'REJEITADO'),
        registro('SAIDA', '2026-03-10T15:00:00Z'),
      ],
      TZ,
    );

    expect(dias[0]?.inconsistencias).toHaveLength(0);
    expect(dias[0]?.minutos_trabalhados).toBe(240);
  });

  it('marca o dia que tem registro pendente de aprovacao', () => {
    const dias = calcularJornada(
      [
        registro('CHEGADA', '2026-03-10T11:00:00Z', 'PENDENTE_APROVACAO'),
        registro('SAIDA', '2026-03-10T15:00:00Z'),
      ],
      TZ,
    );

    expect(dias[0]?.minutos_trabalhados).toBe(240);
    expect(dias[0]?.inconsistencias.map((i) => i.tipo)).toContain(
      'REGISTRO_PENDENTE',
    );
  });

  it('devolve lista vazia quando nao ha registros', () => {
    expect(calcularJornada([], TZ)).toEqual([]);
  });
});
