import { describe, expect, it } from 'vitest';
import type { AvaliacaoGeocerca } from '../../src/lib/geo.js';
import {
  decidirStatus,
  sequenciaValida,
} from '../../src/lib/validacao-checkin.js';

const campus = {
  id: 'campus-sm',
  nome: 'Campus Sao Mateus - UNIVC',
  latitudeCentral: -18.70046,
  longitudeCentral: -39.86322,
  raioPermitidoMetros: 300,
};

const dentro: AvaliacaoGeocerca = {
  campus,
  distanciaMetros: 42,
  dentroDoRaio: true,
};

const fora: AvaliacaoGeocerca = {
  campus,
  distanciaMetros: 1_800,
  dentroDoRaio: false,
};

describe('decidirStatus', () => {
  it('valida o registro dentro do raio com biometria confirmada', () => {
    const decisao = decidirStatus({
      geocerca: dentro,
      metodoBiometrico: 'FACE_ID',
      sincronizadoOffline: false,
    });

    expect(decisao.status).toBe('VALIDADO');
    expect(decisao.motivo).toBe('DENTRO_DO_RAIO');
  });

  it('aceita digital como biometria valida', () => {
    expect(
      decidirStatus({
        geocerca: dentro,
        metodoBiometrico: 'DIGITAL',
        sincronizadoOffline: false,
      }).status,
    ).toBe('VALIDADO');
  });

  it('manda para aprovacao do RH quem esta fora do raio', () => {
    const decisao = decidirStatus({
      geocerca: fora,
      metodoBiometrico: 'FACE_ID',
      sincronizadoOffline: false,
    });

    expect(decisao.status).toBe('PENDENTE_APROVACAO');
    expect(decisao.motivo).toBe('FORA_DO_RAIO');
  });

  it('manda para aprovacao quando nao ha campus cadastrado', () => {
    const decisao = decidirStatus({
      geocerca: null,
      metodoBiometrico: 'FACE_ID',
      sincronizadoOffline: false,
    });

    expect(decisao.status).toBe('PENDENTE_APROVACAO');
    expect(decisao.motivo).toBe('SEM_CAMPUS_CADASTRADO');
  });

  it('valida o registro dentro do raio mesmo sem biometria confirmada', () => {
    const decisao = decidirStatus({
      geocerca: dentro,
      metodoBiometrico: 'NENHUM',
      sincronizadoOffline: false,
    });

    expect(decisao.status).toBe('VALIDADO');
    expect(decisao.motivo).toBe('DENTRO_DO_RAIO');
  });

  it('manda para aprovacao registros vindos da fila offline', () => {
    const decisao = decidirStatus({
      geocerca: dentro,
      metodoBiometrico: 'FACE_ID',
      sincronizadoOffline: true,
    });

    expect(decisao.status).toBe('PENDENTE_APROVACAO');
    expect(decisao.motivo).toBe('REGISTRO_OFFLINE');
  });

  it('prioriza a falha de localizacao sobre o registro offline', () => {
    const decisao = decidirStatus({
      geocerca: fora,
      metodoBiometrico: 'NENHUM',
      sincronizadoOffline: true,
    });

    expect(decisao.motivo).toBe('FORA_DO_RAIO');
  });

  it('nunca atribui REJEITADO automaticamente', () => {
    const combinacoes = [
      { geocerca: null, metodoBiometrico: 'NENHUM' as const, sincronizadoOffline: true },
      { geocerca: fora, metodoBiometrico: 'NENHUM' as const, sincronizadoOffline: true },
      { geocerca: dentro, metodoBiometrico: 'NENHUM' as const, sincronizadoOffline: false },
    ];

    for (const combinacao of combinacoes) {
      expect(decidirStatus(combinacao).status).not.toBe('REJEITADO');
    }
  });
});

describe('sequenciaValida', () => {
  it('exige que o primeiro registro seja uma chegada', () => {
    expect(sequenciaValida(null, 'CHEGADA')).toBe(true);
    expect(sequenciaValida(null, 'SAIDA')).toBe(false);
  });

  it('recusa duas chegadas seguidas', () => {
    expect(sequenciaValida('CHEGADA', 'CHEGADA')).toBe(false);
  });

  it('recusa duas saidas seguidas', () => {
    expect(sequenciaValida('SAIDA', 'SAIDA')).toBe(false);
  });

  it('aceita a alternancia chegada -> saida -> chegada', () => {
    expect(sequenciaValida('CHEGADA', 'SAIDA')).toBe(true);
    expect(sequenciaValida('SAIDA', 'CHEGADA')).toBe(true);
  });
});
