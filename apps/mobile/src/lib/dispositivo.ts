import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import type { MetodoBiometrico } from '../tipos';

/**
 * Acesso ao GPS e a biometria nativa do aparelho.
 *
 * LGPD: `autenticarBiometria` chama a API do sistema operacional, que resolve a
 * comparacao dentro do enclave seguro do aparelho e devolve apenas um booleano.
 * Nenhuma imagem, template ou digital e lida pelo app — o que sobe para o
 * servidor e somente o rotulo do metodo usado (FACE_ID, DIGITAL ou NENHUM).
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

export interface CapacidadeBiometrica {
  disponivel: boolean;
  metodo: MetodoBiometrico;
  /** Preenchido quando `disponivel` e false, explicando o porque. */
  motivo?: string;
}

/** Descobre se o aparelho tem biometria cadastrada e de que tipo. */
export async function verificarBiometria(): Promise<CapacidadeBiometrica> {
  const temHardware = await LocalAuthentication.hasHardwareAsync();
  if (!temHardware) {
    return {
      disponivel: false,
      metodo: 'NENHUM',
      motivo: 'Este aparelho nao tem leitor biometrico.',
    };
  }

  const cadastrada = await LocalAuthentication.isEnrolledAsync();
  if (!cadastrada) {
    return {
      disponivel: false,
      metodo: 'NENHUM',
      motivo:
        'Nenhuma biometria cadastrada neste aparelho. Cadastre Face ID ou digital nos ajustes do sistema.',
    };
  }

  const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const metodo: MetodoBiometrico = tipos.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  )
    ? 'FACE_ID'
    : 'DIGITAL';

  return { disponivel: true, metodo };
}

export type ResultadoBiometria =
  | { ok: true; metodo: MetodoBiometrico }
  | { ok: false; mensagem: string; cancelado: boolean };

/**
 * Pede a confirmacao biometrica ao sistema operacional.
 * `disableDeviceFallback: true` impede cair no PIN/senha do aparelho, que nao
 * comprova a presenca fisica do professor da mesma forma.
 */
export async function autenticarBiometria(
  tipoRegistro: 'CHEGADA' | 'SAIDA',
): Promise<ResultadoBiometria> {
  const capacidade = await verificarBiometria();
  if (!capacidade.disponivel) {
    return {
      ok: false,
      cancelado: false,
      mensagem: capacidade.motivo ?? 'Biometria indisponivel neste aparelho.',
    };
  }

  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage:
      tipoRegistro === 'CHEGADA'
        ? 'Confirme sua identidade para registrar a chegada'
        : 'Confirme sua identidade para registrar a saida',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: true,
  });

  if (resultado.success) {
    return { ok: true, metodo: capacidade.metodo };
  }

  const cancelado =
    resultado.error === 'user_cancel' ||
    resultado.error === 'system_cancel' ||
    resultado.error === 'app_cancel';

  return {
    ok: false,
    cancelado,
    mensagem: cancelado
      ? 'Confirmacao biometrica cancelada.'
      : 'Biometria nao reconhecida. Tente novamente.',
  };
}
