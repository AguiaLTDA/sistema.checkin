/**
 * Calculo de distancia geografica e avaliacao da geocerca do campus.
 *
 * Modulo puro e sem dependencias: e a base da validacao de presenca e o alvo
 * dos testes unitarios em tests/unit/geo.test.ts.
 */

/** Raio medio da Terra em metros (IUGG mean radius R1). */
export const RAIO_TERRA_METROS = 6_371_008.8;

export interface Coordenada {
  latitude: number;
  longitude: number;
}

export interface CampusGeo {
  id: string;
  nome: string;
  latitudeCentral: number;
  longitudeCentral: number;
  raioPermitidoMetros: number;
}

export interface AvaliacaoGeocerca {
  campus: CampusGeo;
  /** Distancia em metros entre o ponto informado e o centro do campus. */
  distanciaMetros: number;
  dentroDoRaio: boolean;
}

function paraRadianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

/**
 * Distancia do circulo maximo entre duas coordenadas, pela formula de
 * Haversine. Retorna metros.
 *
 * A formula assume a Terra como esfera perfeita; para as distancias envolvidas
 * numa geocerca de campus (centenas de metros) o erro e inferior a 0,5%.
 */
export function distanciaHaversineMetros(a: Coordenada, b: Coordenada): number {
  const latitude1 = paraRadianos(a.latitude);
  const latitude2 = paraRadianos(b.latitude);
  const deltaLatitude = paraRadianos(b.latitude - a.latitude);
  const deltaLongitude = paraRadianos(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;

  // `Math.min(1, ...)` protege contra erro de ponto flutuante que faria
  // Math.sqrt receber um valor marginalmente maior que 1.
  return 2 * RAIO_TERRA_METROS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Encontra o campus mais proximo do ponto informado e diz se ele esta dentro
 * do raio permitido daquele campus. Retorna `null` quando nao ha campus
 * cadastrado (situacao tratada como pendente de aprovacao pelo chamador).
 */
export function avaliarGeocerca(
  ponto: Coordenada,
  campi: readonly CampusGeo[],
): AvaliacaoGeocerca | null {
  let melhor: AvaliacaoGeocerca | null = null;

  for (const campus of campi) {
    const distanciaMetros = distanciaHaversineMetros(ponto, {
      latitude: campus.latitudeCentral,
      longitude: campus.longitudeCentral,
    });

    if (melhor === null || distanciaMetros < melhor.distanciaMetros) {
      melhor = {
        campus,
        distanciaMetros,
        dentroDoRaio: distanciaMetros <= campus.raioPermitidoMetros,
      };
    }
  }

  return melhor;
}
