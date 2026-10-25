import type { ErroApi, RespostaLogin } from '@univc/shared';

const URL_API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

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

/**
 * O painel tem duas areas com logins independentes: a do RH (`rh`) e a do
 * usuario que bate ponto (`usuario`). Cada uma guarda a propria sessao, entao
 * da para ter as duas abertas no mesmo navegador.
 */
export type Escopo = 'rh' | 'usuario';

function criarSessao(prefixo: string) {
  const chaveAccess = `${prefixo}.access_token`;
  const chaveRefresh = `${prefixo}.refresh_token`;
  const chaveUsuario = `${prefixo}.usuario`;

  return {
    accessToken: () => localStorage.getItem(chaveAccess),
    refreshToken: () => localStorage.getItem(chaveRefresh),
    usuario: (): RespostaLogin['usuario'] | null => {
      const bruto = localStorage.getItem(chaveUsuario);
      return bruto ? (JSON.parse(bruto) as RespostaLogin['usuario']) : null;
    },
    salvar(resposta: RespostaLogin) {
      localStorage.setItem(chaveAccess, resposta.access_token);
      localStorage.setItem(chaveRefresh, resposta.refresh_token);
      localStorage.setItem(chaveUsuario, JSON.stringify(resposta.usuario));
    },
    /** Atualiza so os dados do usuario (ex.: depois de trocar a senha), sem mexer nos tokens. */
    atualizarUsuario(usuario: RespostaLogin['usuario']) {
      localStorage.setItem(chaveUsuario, JSON.stringify(usuario));
    },
    limpar() {
      localStorage.removeItem(chaveAccess);
      localStorage.removeItem(chaveRefresh);
      localStorage.removeItem(chaveUsuario);
    },
  };
}

export const sessoes: Record<Escopo, ReturnType<typeof criarSessao>> = {
  rh: criarSessao('univc.admin'),
  usuario: criarSessao('univc.usuario'),
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
async function renovarSessao(escopo: Escopo): Promise<boolean> {
  const sessao = sessoes[escopo];
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
  escopo?: Escopo;
}

/**
 * Chamada HTTP com o token do escopo (RH por padrao). Ao receber 401 tenta
 * renovar a sessao uma vez e repete a requisicao; se o refresh tambem falhar,
 * limpa a sessao.
 */
export async function requisitar<T>(
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<T> {
  const { metodo = 'GET', corpo, autenticado = true, escopo = 'rh' } = opcoes;
  const sessao = sessoes[escopo];

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

  if (resposta.status === 401 && autenticado && (await renovarSessao(escopo))) {
    resposta = await enviar();
  }

  if (!resposta.ok) await lerErro(resposta);
  if (resposta.status === 204) return undefined as T;

  return (await resposta.json()) as T;
}

/** Login do RH em /auth/admin/login ou do usuario em /auth/login. */
export async function entrar(
  escopo: Escopo,
  email: string,
  senha: string,
): Promise<RespostaLogin> {
  const resposta = await requisitar<RespostaLogin>(
    escopo === 'rh' ? '/auth/admin/login' : '/auth/login',
    {
      metodo: 'POST',
      corpo: { email, senha },
      autenticado: false,
    },
  );
  sessoes[escopo].salvar(resposta);
  return resposta;
}

/** Troca a senha do usuario logado (obrigatoria depois de uma redefinicao do RH). */
export async function alterarSenha(
  senhaAtual: string,
  senhaNova: string,
): Promise<RespostaLogin['usuario']> {
  const resposta = await requisitar<{ usuario: RespostaLogin['usuario'] }>(
    '/auth/senha',
    {
      metodo: 'PATCH',
      corpo: { senha_atual: senhaAtual, senha_nova: senhaNova },
      escopo: 'usuario',
    },
  );
  sessoes.usuario.atualizarUsuario(resposta.usuario);
  return resposta.usuario;
}

export async function sairDaSessao(escopo: Escopo): Promise<void> {
  const sessao = sessoes[escopo];
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
