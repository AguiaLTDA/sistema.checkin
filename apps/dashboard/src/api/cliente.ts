import type { ErroApi, RespostaLogin } from '@univc/shared';

const URL_API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

const CHAVE_ACCESS = 'univc.admin.access_token';
const CHAVE_REFRESH = 'univc.admin.refresh_token';
const CHAVE_USUARIO = 'univc.admin.usuario';

export class ErroRequisicao extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes?: unknown;

  constructor(status: number, corpo: Partial<ErroApi>) {
    super(corpo.mensagem ?? 'Falha na comunicacao com a API.');
    this.name = 'ErroRequisicao';
    this.status = status;
    this.codigo = corpo.erro ?? 'ERRO';
    this.detalhes = corpo.detalhes;
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

async function lerErro(resposta: Response): Promise<never> {
  let corpo: Partial<ErroApi> = {};
  try {
    corpo = (await resposta.json()) as Partial<ErroApi>;
  } catch {
    corpo = { mensagem: `Erro ${resposta.status} ao chamar a API.` };
  }
  throw new ErroRequisicao(resposta.status, corpo);
}

/** Troca o refresh token por um novo par. Retorna false se a sessao acabou. */
async function renovarSessao(): Promise<boolean> {
  const refreshToken = sessao.refreshToken();
  if (!refreshToken) return false;

  const resposta = await fetch(`${URL_API}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!resposta.ok) {
    sessao.limpar();
    return false;
  }

  sessao.salvar((await resposta.json()) as RespostaLogin);
  return true;
}

interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  autenticado?: boolean;
}

/**
 * Chamada HTTP com token de admin. Ao receber 401 tenta renovar a sessao uma
 * vez e repete a requisicao; se o refresh tambem falhar, limpa a sessao.
 */
export async function requisitar<T>(
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<T> {
  const { metodo = 'GET', corpo, autenticado = true } = opcoes;

  const enviar = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (corpo !== undefined) headers['content-type'] = 'application/json';
    if (autenticado) {
      const token = sessao.accessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }

    return fetch(`${URL_API}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  };

  let resposta = await enviar();

  if (resposta.status === 401 && autenticado && (await renovarSessao())) {
    resposta = await enviar();
  }

  if (!resposta.ok) await lerErro(resposta);
  if (resposta.status === 204) return undefined as T;

  return (await resposta.json()) as T;
}

export async function entrarComoAdmin(
  email: string,
  senha: string,
): Promise<RespostaLogin> {
  const resposta = await requisitar<RespostaLogin>('/auth/admin/login', {
    metodo: 'POST',
    corpo: { email, senha },
    autenticado: false,
  });
  sessao.salvar(resposta);
  return resposta;
}

export async function sairDaSessao(): Promise<void> {
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

/** Monta uma query string ignorando filtros vazios. */
export function comQuery(
  base: string,
  parametros: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === '') continue;
    query.set(chave, String(valor));
  }
  const texto = query.toString();
  return texto ? `${base}?${texto}` : base;
}
