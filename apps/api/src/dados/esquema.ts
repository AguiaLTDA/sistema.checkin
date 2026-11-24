import { randomUUID } from 'node:crypto';

/**
 * Esquema das abas da planilha. Cada modelo vira uma aba cujo nome e o da
 * antiga tabela do Postgres, e cada campo vira uma coluna com o nome antigo
 * (snake_case) — assim a planilha bate coluna a coluna com o backup do
 * Supabase e com o que o RH ja conhecia.
 *
 * Na planilha tudo e texto. A conversao de tipos acontece aqui, nos dois
 * sentidos, e e estrita: um valor que nao pode ser lido com o tipo da coluna
 * gera erro em vez de virar dado errado em silencio.
 */

export type NomeModelo =
  | 'professor'
  | 'perfil'
  | 'admin'
  | 'campus'
  | 'registroPonto'
  | 'refreshToken'
  | 'logAuditoria';

export type TipoColuna = 'texto' | 'numero' | 'inteiro' | 'booleano' | 'data' | 'json';

export interface DefColuna {
  /** Nome do campo no modelo (camelCase). */
  campo: string;
  /** Cabecalho da coluna na planilha (snake_case). */
  coluna: string;
  tipo: TipoColuna;
  nulo: boolean;
  /** Valor usado quando o campo nao e informado na criacao. */
  padrao?: () => unknown;
  /** Valores aceitos (enums). */
  valores?: readonly string[];
  /** CPF: a planilha pode ter convertido em numero e comido o zero inicial. */
  digitos?: number;
}

export interface DefTabela {
  modelo: NomeModelo;
  aba: string;
  colunas: DefColuna[];
  /** Campos com restricao de unicidade (alem do id). */
  unicos: string[];
  /** true quando o modelo tem `updatedAt`, atualizado a cada escrita. */
  temUpdatedAt: boolean;
}

function snake(campo: string): string {
  return campo.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
}

function col(
  campo: string,
  tipo: TipoColuna,
  opcoes: Partial<Omit<DefColuna, 'campo' | 'tipo'>> = {},
): DefColuna {
  return { campo, coluna: snake(campo), tipo, nulo: false, ...opcoes };
}

const agora = () => new Date();

const id = col('id', 'texto', { padrao: () => randomUUID() });
const createdAt = col('createdAt', 'data', { padrao: agora });
const updatedAt = col('updatedAt', 'data', { padrao: agora });
const ativo = col('ativo', 'booleano', { padrao: () => true });

export const TIPOS_REGISTRO = ['CHEGADA', 'SAIDA'] as const;
export const STATUS_REGISTRO = ['VALIDADO', 'PENDENTE_APROVACAO', 'REJEITADO'] as const;
export const RESULTADOS_AUDITORIA = ['SUCESSO', 'REJEITADO', 'ERRO'] as const;
export const ACOES_AUDITORIA = [
  'LOGIN_SUCESSO',
  'LOGIN_FALHA',
  'REFRESH_TOKEN',
  'LOGOUT',
  'TENTATIVA_CHECKIN',
  'APROVACAO_MANUAL',
  'REJEICAO_MANUAL',
  'REDEFINICAO_SENHA',
  'ALTERACAO_SENHA',
  'CRIACAO_PROFESSOR',
  'EDICAO_PROFESSOR',
  'EXCLUSAO_PROFESSOR',
  'PERFIL_CRIADO',
  'PERFIL_ATUALIZADO',
  'EDICAO_ADMIN',
] as const;

export const TABELAS: Record<NomeModelo, DefTabela> = {
  professor: {
    modelo: 'professor',
    aba: 'professores',
    colunas: [
      id,
      col('nome', 'texto'),
      col('cpf', 'texto', { digitos: 11 }),
      col('email', 'texto'),
      col('senhaHash', 'texto'),
      col('deveTrocarSenha', 'booleano', { padrao: () => false }),
      col('cursoVinculado', 'texto'),
      col('perfilId', 'texto', { nulo: true }),
      ativo,
      createdAt,
      updatedAt,
    ],
    unicos: ['cpf', 'email'],
    temUpdatedAt: true,
  },
  perfil: {
    modelo: 'perfil',
    aba: 'perfis',
    colunas: [
      id,
      col('nome', 'texto'),
      col('descricao', 'texto', { nulo: true }),
      ativo,
      createdAt,
      updatedAt,
    ],
    unicos: ['nome'],
    temUpdatedAt: true,
  },
  admin: {
    modelo: 'admin',
    aba: 'admins',
    colunas: [
      id,
      col('nome', 'texto'),
      col('email', 'texto'),
      col('senhaHash', 'texto'),
      ativo,
      createdAt,
      updatedAt,
    ],
    unicos: ['email'],
    temUpdatedAt: true,
  },
  campus: {
    modelo: 'campus',
    aba: 'campi',
    colunas: [
      id,
      col('nome', 'texto'),
      col('latitudeCentral', 'numero'),
      col('longitudeCentral', 'numero'),
      col('raioPermitidoMetros', 'inteiro'),
      ativo,
      createdAt,
      updatedAt,
    ],
    unicos: ['nome'],
    temUpdatedAt: true,
  },
  registroPonto: {
    modelo: 'registroPonto',
    aba: 'registros_ponto',
    colunas: [
      id,
      col('professorId', 'texto'),
      col('tipo', 'texto', { valores: TIPOS_REGISTRO }),
      col('timestampServidor', 'data', { padrao: agora }),
      col('latitude', 'numero'),
      col('longitude', 'numero'),
      col('distanciaDoCampusMetros', 'numero'),
      col('precisaoMetros', 'numero', { nulo: true }),
      col('status', 'texto', { valores: STATUS_REGISTRO }),
      col('sincronizadoOffline', 'booleano', { padrao: () => false }),
      col('registradoOfflineEm', 'data', { nulo: true }),
      col('justificativaManual', 'texto', { nulo: true }),
      col('campusId', 'texto', { nulo: true }),
      // Unica coluna cujo nome nao segue o camelCase -> snake_case direto.
      col('decididoPor', 'texto', { nulo: true, coluna: 'decidido_por_id' }),
      col('decididoEm', 'data', { nulo: true }),
      createdAt,
      updatedAt,
    ],
    unicos: [],
    temUpdatedAt: true,
  },
  refreshToken: {
    modelo: 'refreshToken',
    aba: 'refresh_tokens',
    colunas: [
      id,
      col('tokenHash', 'texto'),
      col('professorId', 'texto', { nulo: true }),
      col('adminId', 'texto', { nulo: true }),
      col('expiraEm', 'data'),
      col('revogadoEm', 'data', { nulo: true }),
      createdAt,
    ],
    unicos: ['tokenHash'],
    temUpdatedAt: false,
  },
  logAuditoria: {
    modelo: 'logAuditoria',
    aba: 'logs_auditoria',
    colunas: [
      id,
      col('acao', 'texto', { valores: ACOES_AUDITORIA }),
      col('resultado', 'texto', { valores: RESULTADOS_AUDITORIA }),
      col('professorId', 'texto', { nulo: true }),
      col('adminId', 'texto', { nulo: true }),
      col('registroId', 'texto', { nulo: true }),
      col('detalhes', 'json', { nulo: true }),
      col('ip', 'texto', { nulo: true }),
      col('userAgent', 'texto', { nulo: true }),
      col('criadoEm', 'data', { padrao: agora }),
    ],
    unicos: [],
    temUpdatedAt: false,
  },
};

export const MODELOS = Object.keys(TABELAS) as NomeModelo[];

/** Cabecalhos de cada aba, na ordem do esquema. */
export function cabecalhosPorAba(): Record<string, string[]> {
  return Object.fromEntries(
    MODELOS.map((modelo) => [
      TABELAS[modelo].aba,
      TABELAS[modelo].colunas.map((coluna) => coluna.coluna),
    ]),
  );
}

/** Erro de leitura: uma celula da planilha nao tem o formato da coluna. */
export class ErroDadosPlanilha extends Error {
  constructor(
    readonly aba: string,
    readonly coluna: string,
    readonly idLinha: string,
    detalhe: string,
  ) {
    super(
      `Valor invalido na aba "${aba}", coluna "${coluna}" (linha de id "${idLinha}"): ${detalhe}`,
    );
    this.name = 'ErroDadosPlanilha';
  }
}

/** Converte um valor do modelo no texto gravado na celula ('' = vazio). */
export function codificar(valor: unknown, coluna: DefColuna): string {
  if (valor === null || valor === undefined) return '';

  switch (coluna.tipo) {
    case 'texto':
      return String(valor);
    case 'numero':
    case 'inteiro':
      return String(valor);
    case 'booleano':
      return valor ? 'TRUE' : 'FALSE';
    case 'data':
      return (valor instanceof Date ? valor : new Date(String(valor))).toISOString();
    case 'json':
      return JSON.stringify(valor);
  }
}

const VERDADEIROS = new Set(['TRUE', 'VERDADEIRO', '1', 'T', 'SIM']);
const FALSOS = new Set(['FALSE', 'FALSO', '0', 'F', 'NAO', 'NÃO']);

/**
 * Converte o conteudo bruto de uma celula no valor do modelo. Aceita tanto o
 * texto que a propria API grava quanto o que a planilha devolve depois de uma
 * edicao manual (numero, booleano ou data nativos da planilha).
 */
export function decodificar(
  bruto: unknown,
  coluna: DefColuna,
  aba: string,
  idLinha: string,
): unknown {
  const falhar = (detalhe: string): never => {
    throw new ErroDadosPlanilha(aba, coluna.coluna, idLinha, detalhe);
  };

  if (bruto === null || bruto === undefined || bruto === '') {
    if (coluna.nulo) return null;
    return falhar('celula vazia em coluna obrigatoria');
  }

  switch (coluna.tipo) {
    case 'texto': {
      let texto = String(bruto);
      if (coluna.digitos && /^\d+$/.test(texto) && texto.length < coluna.digitos) {
        texto = texto.padStart(coluna.digitos, '0');
      }
      if (coluna.valores && !coluna.valores.includes(texto)) {
        return falhar(`esperado um de: ${coluna.valores.join(', ')}`);
      }
      return texto;
    }

    case 'numero':
    case 'inteiro': {
      let numero: number;
      if (typeof bruto === 'number') {
        numero = bruto;
      } else {
        let texto = String(bruto).trim();
        // Edicao manual em planilha pt-BR pode chegar com virgula decimal.
        if (texto.includes(',') && !texto.includes('.')) texto = texto.replace(',', '.');
        numero = texto === '' ? Number.NaN : Number(texto);
      }
      if (!Number.isFinite(numero)) return falhar('esperado um numero');
      if (coluna.tipo === 'inteiro' && !Number.isInteger(numero)) {
        return falhar('esperado um numero inteiro');
      }
      return numero;
    }

    case 'booleano': {
      if (typeof bruto === 'boolean') return bruto;
      const texto = String(bruto).trim().toUpperCase();
      if (VERDADEIROS.has(texto)) return true;
      if (FALSOS.has(texto)) return false;
      return falhar('esperado TRUE ou FALSE');
    }

    case 'data': {
      const data = bruto instanceof Date ? bruto : new Date(String(bruto));
      if (Number.isNaN(data.getTime())) return falhar('esperada uma data ISO 8601');
      return data;
    }

    case 'json': {
      if (typeof bruto !== 'string') return bruto;
      try {
        return JSON.parse(bruto) as unknown;
      } catch {
        // Detalhe de auditoria editado a mao: melhor manter o texto do que
        // derrubar a leitura da aba inteira.
        return bruto;
      }
    }
  }
}

/** Linha do modelo -> registro da planilha (cabecalho -> texto). */
export function linhaParaPlanilha(
  tabela: DefTabela,
  linha: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    tabela.colunas.map((coluna) => [coluna.coluna, codificar(linha[coluna.campo], coluna)]),
  );
}

/** Registro da planilha -> linha do modelo. Colunas extras sao ignoradas. */
export function planilhaParaLinha(
  tabela: DefTabela,
  registro: Record<string, unknown>,
): Record<string, unknown> {
  const idLinha = String(registro.id ?? '?');
  return Object.fromEntries(
    tabela.colunas.map((coluna) => [
      coluna.campo,
      decodificar(registro[coluna.coluna], coluna, tabela.aba, idLinha),
    ]),
  );
}
