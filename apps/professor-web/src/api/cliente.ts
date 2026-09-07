import type {
  RegistroPontoDTO,
  RespostaLogin,
  RespostaPaginada,
} from '@univc/shared';

export const URL_API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

const CHAVE_ACCESS = 'univc.professor.access_token';
const CHAVE_REFRESH = 'univc.professor.refresh_token';
const CHAVE_USUARIO = 'univc.professor.usuario';

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

/** Falha de rede: nada chegou ao servidor. */
export class ErroDeRede extends Error {
  constructor(mensagem = 'Sem conexao com o servidor.') {
    super(mensagem);
    this.name = 'ErroDeRede';
  }
}

export const sessao = {
  accessToken: () => localStorage.getItem(CHAVE_ACCESS),
  refreshToken: () => localStorage.getItem(CHAVE_REFRESH),
  usuario: (): RespostaLogin['usuario'] | null => {
    const bruto = localStorage.getItem(CHAVE_USUARIO);
    return bruto ? (JSON.parse(bruto) as RespostaLogin['usuario']) : null;
  },
  salvar(resposta: RespostaLogin) {
    localStorage.setItem(CHAVE_ACCESS, resposta.access_token);
    localStorage.setItem(CHAVE_REFRESH, resposta.refresh_token);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(resposta.usuario));
  },
  limpar() {
    localStorage.removeItem(CHAVE_ACCESS);
    localStorage.removeItem(CHAVE_REFRESH);
    localStorage.removeItem(CHAVE_USUARIO);
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
    const token = sessao.accessToken();
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
  const refreshToken = sessao.refreshToken();
  if (!refreshToken) return false;

  const resposta = await enviar('/auth/refresh', {
    metodo: 'POST',
    corpo: { refresh_token: refreshToken },
    autenticado: false,
  });

  if (!resposta.ok) {
    sessao.limpar();
    return false;
  }

  sessao.salvar((await resposta.json()) as RespostaLogin);
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

export async function entrar(email: string, senha: string): Promise<RespostaLogin> {
  const resposta = await requisitar<RespostaLogin>('/auth/login', {
    metodo: 'POST',
    corpo: { email: email.trim().toLowerCase(), senha },
    autenticado: false,
  });
  sessao.salvar(resposta);
  return resposta;
}

export async function sair(): Promise<void> {
  const refreshToken = sessao.refreshToken();
  if (refreshToken) {
    await requisitar('/auth/logout', {
      metodo: 'POST',
      corpo: { refresh_token: refreshToken },
      autenticado: false,
    }).catch(() => undefined);
  }
  sessao.limpar();
}

export interface CorpoCheckin {
  tipo: 'CHEGADA' | 'SAIDA';
  /** Unica prova de presenca aceita pela API: nao ha campo de biometria. */
  latitude: number;
  longitude: number;
  precisao_metros?: number;
}

export interface RespostaCheckin {
  registro: RegistroPontoDTO;
  motivo: string;
  mensagem: string;
}

export interface RespostaUltimo {
  ultimo: RegistroPontoDTO | null;
  proximo_tipo_esperado: 'CHEGADA' | 'SAIDA';
}

export function enviarCheckin(corpo: CorpoCheckin): Promise<RespostaCheckin> {
  return requisitar<RespostaCheckin>('/checkin', { metodo: 'POST', corpo });
}

export function buscarUltimoRegistro(): Promise<RespostaUltimo> {
  return requisitar<RespostaUltimo>('/checkin/ultimo');
}

export function buscarHistorico(
  pagina = 1,
): Promise<RespostaPaginada<RegistroPontoDTO>> {
  return requisitar<RespostaPaginada<RegistroPontoDTO>>(
    `/checkin/historico?pagina=${pagina}&por_pagina=30`,
  );
}
