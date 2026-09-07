import * as Location from 'expo-location';

/**
 * Acesso ao GPS do aparelho.
 *
 * A localizacao e a unica prova de presenca do sistema: sem ela nao ha
 * registro. O app nao le biometria em nenhum momento e nao depende de
 * `expo-local-authentication`.
 *
 * LGPD: a posicao e lida somente quando o professor toca em marcar chegada ou
 * saida, nunca em segundo plano.
 */

export interface Posicao {
  latitude: number;
  longitude: number;
  precisaoMetros?: number;
}

export type ResultadoLocalizacao =
  | { ok: true; posicao: Posicao }
  | { ok: false; motivo: 'PERMISSAO_NEGADA' | 'INDISPONIVEL'; mensagem: string };

export async function obterLocalizacao(): Promise<ResultadoLocalizacao> {
  const permissao = await Location.requestForegroundPermissionsAsync();

  if (permissao.status !== 'granted') {
    return {
      ok: false,
      motivo: 'PERMISSAO_NEGADA',
      mensagem:
        'Sem a permissao de localizacao nao da para confirmar que voce esta no campus, e o registro nao pode ser feito. Libere o acesso a localizacao nos ajustes do aparelho e tente de novo.',
    };
  }

  try {
    const posicao = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      ok: true,
      posicao: {
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
        precisaoMetros: posicao.coords.accuracy ?? undefined,
      },
    };
  } catch {
    return {
      ok: false,
      motivo: 'INDISPONIVEL',
      mensagem:
        'Nao foi possivel obter sua localizacao. Verifique se o GPS esta ligado e tente novamente.',
    };
  }
}
