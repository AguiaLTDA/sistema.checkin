import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  RespostaCheckin,
  RespostaHistorico,
  RespostaLogin,
  RespostaUltimo,
  UsuarioAutenticado,
} from '../tipos';

/**
 * `EXPO_PUBLIC_API_URL` e lido no bundle. Rodando no Expo Go, aponte para o IP
 * da sua maquina na rede local (localhost, no celular, e o proprio celular).
 */
export const URL_API =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';

const CHAVE_ACCESS = 'univc.access_token';
const CHAVE_REFRESH = 'univc.refresh_token';
const CHAVE_USUARIO = 'univc.usuario';

/** Falha vinda da API (a requisicao chegou e voltou com erro). */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
  }
}

/** Falha de rede: nada chegou ao servidor. E o gatilho da fila offline. */
export class ErroDeRede extends Error {
  constructor(mensagem = 'Sem conexao com o servidor.') {
    super(mensagem);
    this.name = 'ErroDeRede';
  }
}

export const armazenamentoSessao = {
  async salvar(resposta: RespostaLogin): Promise<void> {
    await AsyncStorage.multiSet([
      [CHAVE_ACCESS, resposta.access_token],
      [CHAVE_REFRESH, resposta.refresh_token],
      [CHAVE_USUARIO, JSON.stringify(resposta.usuario)],
    ]);
  },
  async limpar(): Promise<void> {
    await AsyncStorage.multiRemove([CHAVE_ACCESS, CHAVE_REFRESH, CHAVE_USUARIO]);
  },
  accessToken: () => AsyncStorage.getItem(CHAVE_ACCESS),
  refreshToken: () => AsyncStorage.getItem(CHAVE_REFRESH),
  async usuario(): Promise<UsuarioAutenticado | null> {
    const bruto = await AsyncStorage.getItem(CHAVE_USUARIO);
    return bruto ? (JSON.parse(bruto) as UsuarioAutenticado) : null;
  },
  /** Atualiza so os dados do usuario (ex.: depois de trocar a senha), sem mexer nos tokens. */
  async salvarUsuario(usuario: UsuarioAutenticado): Promise<void> {
    await AsyncStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  },
};

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PATCH';
  corpo?: unknown;
  autenticado?: boolean;
  /** Aborta a requisicao apos N ms (padrao 15 s). */
  timeoutMs?: number;
}

async function enviar(caminho: string, opcoes: Opcoes): Promise<Response> {
  const { metodo = 'GET', corpo, autenticado = true, timeoutMs = 15_000 } = opcoes;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (autenticado) {
    const token = await armazenamentoSessao.accessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const controlador = new AbortController();
  const tempo = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    return await fetch(`${URL_API}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controlador.signal,
    });
  } catch {
    // fetch so rejeita por falha de transporte (offline, DNS, timeout).
    throw new ErroDeRede();
  } finally {
    clearTimeout(tempo);
  }
}

async function renovarSessao(): Promise<boolean> {
  const refreshToken = await armazenamentoSessao.refreshToken();
  if (!refreshToken) return false;

  const resposta = await enviar('/auth/refresh', {
    metodo: 'POST',
    corpo: { refresh_token: refreshToken },
    autenticado: false,
  });

  if (!resposta.ok) {
    await armazenamentoSessao.limpar();
    return false;
  }

  await armazenamentoSessao.salvar((await resposta.json()) as RespostaLogin);
  return true;
}

async function requisitar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  let resposta = await enviar(caminho, opcoes);

  if (resposta.status === 401 && opcoes.autenticado !== false) {
    if (await renovarSessao()) {
      resposta = await enviar(caminho, opcoes);
    }
  }

  if (!resposta.ok) {
    let corpo: { erro?: string; mensagem?: string } = {};
    try {
      corpo = (await resposta.json()) as typeof corpo;
    } catch {
      corpo = {};
    }
    throw new ErroApi(
      resposta.status,
      corpo.erro ?? 'ERRO',
      corpo.mensagem ?? `Erro ${resposta.status} ao falar com o servidor.`,
    );
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export async function entrar(
  email: string,
  senha: string,
): Promise<RespostaLogin> {
  const resposta = await requisitar<RespostaLogin>('/auth/login', {
    metodo: 'POST',
    corpo: { email: email.trim().toLowerCase(), senha },
    autenticado: false,
  });
  await armazenamentoSessao.salvar(resposta);
  return resposta;
}

export async function alterarSenha(
  senhaAtual: string,
  senhaNova: string,
): Promise<UsuarioAutenticado> {
  const resposta = await requisitar<{ usuario: UsuarioAutenticado }>(
    '/auth/senha',
    {
      metodo: 'PATCH',
      corpo: { senha_atual: senhaAtual, senha_nova: senhaNova },
    },
  );
  await armazenamentoSessao.salvarUsuario(resposta.usuario);
  return resposta.usuario;
}

export async function sair(): Promise<void> {
  const refreshToken = await armazenamentoSessao.refreshToken();
  if (refreshToken) {
    await requisitar('/auth/logout', {
      metodo: 'POST',
      corpo: { refresh_token: refreshToken },
      autenticado: false,
    }).catch(() => undefined);
  }
  await armazenamentoSessao.limpar();
}

export interface CorpoCheckin {
  tipo: 'CHEGADA' | 'SAIDA';
  /** Unica prova de presenca aceita pela API: nao ha campo de biometria. */
  latitude: number;
  longitude: number;
  precisao_metros?: number;
  sincronizado_offline?: boolean;
  registrado_offline_em?: string;
}

export function enviarCheckin(corpo: CorpoCheckin): Promise<RespostaCheckin> {
  return requisitar<RespostaCheckin>('/checkin', { metodo: 'POST', corpo });
}

export function buscarUltimoRegistro(): Promise<RespostaUltimo> {
  return requisitar<RespostaUltimo>('/checkin/ultimo');
}

export function buscarHistorico(pagina = 1): Promise<RespostaHistorico> {
  return requisitar<RespostaHistorico>(
    `/checkin/historico?pagina=${pagina}&por_pagina=30`,
  );
}
