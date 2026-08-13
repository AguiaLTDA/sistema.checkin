import { describe, expect, it } from 'vitest';
import {
  type CampusGeo,
  avaliarGeocerca,
  distanciaHaversineMetros,
} from '../../src/lib/geo.js';

const CAMPUS_SAO_MATEUS: CampusGeo = {
  id: 'campus-sm',
  nome: 'Campus Sao Mateus - UNIVC',
  latitudeCentral: -18.70046,
  longitudeCentral: -39.86322,
  raioPermitidoMetros: 300,
};

describe('distanciaHaversineMetros', () => {
  it('retorna zero para o mesmo ponto', () => {
    const ponto = { latitude: -18.70046, longitude: -39.86322 };
    expect(distanciaHaversineMetros(ponto, ponto)).toBe(0);
  });

  it('calcula a distancia de um grau de latitude (~111,2 km)', () => {
    const distancia = distanciaHaversineMetros(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    );
    expect(distancia).toBeCloseTo(111_195, -2);
  });

  it('e simetrica: a->b tem a mesma distancia de b->a', () => {
    const a = { latitude: -18.70046, longitude: -39.86322 };
    const b = { latitude: -20.31944, longitude: -40.33778 };
    expect(distanciaHaversineMetros(a, b)).toBeCloseTo(
      distanciaHaversineMetros(b, a),
      6,
    );
  });

  it('calcula a distancia Sao Mateus -> Vitoria (~185 km) com erro < 1%', () => {
    const distancia = distanciaHaversineMetros(
      { latitude: -18.70046, longitude: -39.86322 },
      { latitude: -20.31944, longitude: -40.33778 },
    );
    expect(distancia).toBeGreaterThan(183_000);
    expect(distancia).toBeLessThan(187_000);
  });

  it('nao retorna NaN em pontos antipodais', () => {
    const distancia = distanciaHaversineMetros(
      { latitude: -18.70046, longitude: -39.86322 },
      { latitude: 18.70046, longitude: 140.13678 },
    );
    expect(Number.isNaN(distancia)).toBe(false);
    expect(distancia).toBeGreaterThan(19_000_000);
  });

  it('lida com a travessia do antimeridiano', () => {
    const distancia = distanciaHaversineMetros(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    // 0,2 grau de longitude no equador ~ 22,2 km (e nao a volta pelo mundo).
    expect(distancia).toBeCloseTo(22_250, -3);
  });
});

describe('avaliarGeocerca', () => {
  it('aceita um ponto no centro do campus', () => {
    const avaliacao = avaliarGeocerca(
      { latitude: -18.70046, longitude: -39.86322 },
      [CAMPUS_SAO_MATEUS],
    );

    expect(avaliacao?.dentroDoRaio).toBe(true);
    expect(avaliacao?.distanciaMetros).toBe(0);
    expect(avaliacao?.campus.id).toBe('campus-sm');
  });

  it('aceita um ponto dentro do raio permitido', () => {
    // ~111 m ao norte do centro.
    const avaliacao = avaliarGeocerca(
      { latitude: -18.69946, longitude: -39.86322 },
      [CAMPUS_SAO_MATEUS],
    );

    expect(avaliacao?.distanciaMetros).toBeLessThan(300);
    expect(avaliacao?.dentroDoRaio).toBe(true);
  });

  it('recusa um ponto fora do raio permitido', () => {
    // ~1,7 km ao sul do centro.
    const avaliacao = avaliarGeocerca(
      { latitude: -18.71600, longitude: -39.86322 },
      [CAMPUS_SAO_MATEUS],
    );

    expect(avaliacao?.distanciaMetros).toBeGreaterThan(300);
    expect(avaliacao?.dentroDoRaio).toBe(false);
  });

  it('trata a borda do raio como dentro (comparacao <=)', () => {
    const campusUmMetro: CampusGeo = {
      ...CAMPUS_SAO_MATEUS,
      raioPermitidoMetros: 0,
    };
    const avaliacao = avaliarGeocerca(
      { latitude: -18.70046, longitude: -39.86322 },
      [campusUmMetro],
    );

    expect(avaliacao?.dentroDoRaio).toBe(true);
  });

  it('escolhe o campus mais proximo quando ha varios polos', () => {
    const polo: CampusGeo = {
      id: 'polo-linhares',
      nome: 'Polo Linhares',
      latitudeCentral: -19.39167,
      longitudeCentral: -40.07222,
      raioPermitidoMetros: 200,
    };

    const avaliacao = avaliarGeocerca(
      { latitude: -19.39200, longitude: -40.07230 },
      [CAMPUS_SAO_MATEUS, polo],
    );

    expect(avaliacao?.campus.id).toBe('polo-linhares');
    expect(avaliacao?.dentroDoRaio).toBe(true);
  });

  it('usa o raio do campus escolhido, e nao um raio global', () => {
    const poloRaioCurto: CampusGeo = {
      id: 'polo-curto',
      nome: 'Polo com raio de 50 m',
      latitudeCentral: -18.70046,
      longitudeCentral: -39.86322,
      raioPermitidoMetros: 50,
    };

    // ~111 m do centro: dentro dos 300 m do campus, fora dos 50 m do polo.
    const ponto = { latitude: -18.69946, longitude: -39.86322 };

    expect(avaliarGeocerca(ponto, [poloRaioCurto])?.dentroDoRaio).toBe(false);
    expect(avaliarGeocerca(ponto, [CAMPUS_SAO_MATEUS])?.dentroDoRaio).toBe(true);
  });

  it('retorna null quando nao ha campus cadastrado', () => {
    expect(avaliarGeocerca({ latitude: 0, longitude: 0 }, [])).toBeNull();
  });
});
