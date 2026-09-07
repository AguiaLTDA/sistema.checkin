/**
 * Acesso a localizacao pelo navegador (Geolocation API).
 *
 * A localizacao e a unica prova de presenca do sistema: sem ela nao ha
 * registro. Nao ha leitura de biometria em nenhum momento. A posicao so e
 * lida quando o professor toca em marcar chegada ou saida, nunca em segundo
 * plano.
 */

export interface Posicao {
  latitude: number;
  longitude: number;
  precisaoMetros?: number;
}

export type ResultadoLocalizacao =
  | { ok: true; posicao: Posicao }
  | { ok: false; motivo: 'PERMISSAO_NEGADA' | 'INDISPONIVEL'; mensagem: string };

export function obterLocalizacao(): Promise<ResultadoLocalizacao> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({
        ok: false,
        motivo: 'INDISPONIVEL',
        mensagem:
          'Este navegador nao suporta geolocalizacao. Tente em outro navegador ou aparelho.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        resolve({
          ok: true,
          posicao: {
            latitude: posicao.coords.latitude,
            longitude: posicao.coords.longitude,
            precisaoMetros: posicao.coords.accuracy ?? undefined,
          },
        });
      },
      (erro) => {
        if (erro.code === erro.PERMISSION_DENIED) {
          resolve({
            ok: false,
            motivo: 'PERMISSAO_NEGADA',
            mensagem:
              'Sem a permissao de localizacao nao da para confirmar que voce esta no campus, e o registro nao pode ser feito. Libere o acesso a localizacao nas configuracoes do navegador e tente de novo.',
          });
          return;
        }
        resolve({
          ok: false,
          motivo: 'INDISPONIVEL',
          mensagem:
            'Nao foi possivel obter sua localizacao. Verifique se o GPS/localizacao esta ligado e tente novamente.',
        });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
