import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  MODELOS,
  TABELAS,
  linhaParaPlanilha,
  planilhaParaLinha,
  type DefColuna,
  type NomeModelo,
} from '../src/dados/esquema.js';

/**
 * Leitura do backup do Supabase (dump em texto do pg_dumpall) e conversao
 * para o esquema atual da planilha. Nao executa nenhum SQL do arquivo: so
 * extrai os blocos `COPY public.<tabela> ... FROM stdin;` e decodifica.
 */

type Linha = Record<string, unknown>;

export interface DadosImportados {
  linhas: Record<NomeModelo, Linha[]>;
  avisos: string[];
  /** Tabelas do dump que nao viram aba (ex.: _prisma_migrations). */
  ignoradas: string[];
}

/** Desfaz o escape do formato texto do COPY (\N = nulo, \t, \n, \\...). */
export function desescaparCopy(campo: string): string | null {
  if (campo === '\\N') return null;
  return campo.replace(/\\(?:([0-7]{1,3})|x([0-9a-fA-F]{1,2})|(.))/g, (_t, octal, hexa, letra) => {
    if (octal) return String.fromCharCode(parseInt(octal as string, 8));
    if (hexa) return String.fromCharCode(parseInt(hexa as string, 16));
    switch (letra) {
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'v':
        return '\v';
      default:
        return letra as string;
    }
  });
}

/** Extrai os blocos COPY do schema public: tabela -> linhas (coluna -> texto). */
export function extrairCopies(dump: string): Map<string, Record<string, string | null>[]> {
  const tabelas = new Map<string, Record<string, string | null>[]>();
  const linhas = dump.split('\n');
  const inicio = /^COPY public\.("?)([A-Za-z0-9_]+)\1 \(([^)]*)\) FROM stdin;$/;

  for (let i = 0; i < linhas.length; i += 1) {
    const cabecalho = inicio.exec(linhas[i] ?? '');
    if (!cabecalho) continue;

    const tabela = cabecalho[2]!;
    const colunas = cabecalho[3]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const registros: Record<string, string | null>[] = [];

    for (i += 1; i < linhas.length && linhas[i] !== '\\.'; i += 1) {
      const campos = (linhas[i] ?? '').split('\t');
      if (campos.length !== colunas.length) {
        throw new Error(
          `Linha ${i + 1} da tabela ${tabela} tem ${campos.length} campos, esperado ${colunas.length}.`,
        );
      }
      registros.push(
        Object.fromEntries(colunas.map((coluna, j) => [coluna, desescaparCopy(campos[j]!)])),
      );
    }
    if (linhas[i] !== '\\.') throw new Error(`Bloco COPY de ${tabela} sem terminador "\\.".`);
    tabelas.set(tabela, registros);
  }

  return tabelas;
}

/** Texto do Postgres -> valor do modelo, no tipo da coluna. */
function converter(valor: string | null, coluna: DefColuna, tabela: string): unknown {
  if (valor === null) return null;
  const falhar = (): never => {
    throw new Error(`Valor invalido em ${tabela}.${coluna.coluna}: ${JSON.stringify(valor)}`);
  };

  switch (coluna.tipo) {
    case 'texto':
      return valor;
    case 'numero':
    case 'inteiro': {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) return falhar();
      return numero;
    }
    case 'booleano':
      if (valor === 't' || valor === 'true') return true;
      if (valor === 'f' || valor === 'false') return false;
      return falhar();
    case 'data': {
      // timestamp(3) sem fuso: o Prisma grava em UTC. Com fuso (timestamptz),
      // o deslocamento vem no texto e e respeitado.
      const iso = valor.replace(' ', 'T');
      const temFuso = /([+-]\d{2}(:?\d{2})?|Z)$/.test(iso);
      const data = new Date(temFuso ? iso.replace(/([+-]\d{2})$/, '$1:00') : `${iso}Z`);
      if (Number.isNaN(data.getTime())) return falhar();
      return data;
    }
    case 'json':
      try {
        return JSON.parse(valor) as unknown;
      } catch {
        return falhar();
      }
  }
}

const PERFIS_PADRAO = [
  { nome: 'Professor', descricao: 'Docente vinculado a um curso' },
  { nome: 'Estagiário', descricao: 'Estagiário em atividade na instituição' },
  { nome: 'Estudante', descricao: 'Aluno com registro de presença' },
] as const;

/**
 * Converte o dump no esquema atual, reproduzindo as migrations que vieram
 * depois do backup. Aborta (lanca erro) em vez de descartar qualquer dado.
 */
export function converterDump(dump: string): DadosImportados {
  const copies = extrairCopies(dump);
  const avisos: string[] = [];
  const linhas = Object.fromEntries(MODELOS.map((m) => [m, [] as Linha[]])) as Record<
    NomeModelo,
    Linha[]
  >;
  const porAba = new Map(MODELOS.map((modelo) => [TABELAS[modelo].aba, modelo]));
  const ignoradas = [...copies.keys()].filter((tabela) => !porAba.has(tabela));

  for (const [tabela, registros] of copies) {
    const modelo = porAba.get(tabela);
    if (!modelo) continue;
    const def = TABELAS[modelo];
    const colunasDump = registros.length ? Object.keys(registros[0]!) : [];

    const desconhecidas = colunasDump.filter(
      (coluna) => !def.colunas.some((c) => c.coluna === coluna),
    );
    if (desconhecidas.length) {
      throw new Error(
        `A tabela ${tabela} do backup tem colunas que a planilha nao tem (${desconhecidas.join(', ')}). ` +
          'Importacao abortada para nao perder esses dados.',
      );
    }

    for (const registro of registros) {
      const linha: Linha = {};
      for (const coluna of def.colunas) {
        if (coluna.coluna in registro) {
          linha[coluna.campo] = converter(registro[coluna.coluna]!, coluna, tabela);
        } else if (coluna.campo === 'perfilId' && modelo === 'professor') {
          linha[coluna.campo] = null; // preenchido abaixo, como na migration
        } else if (coluna.padrao) {
          linha[coluna.campo] = coluna.padrao();
        } else if (coluna.nulo) {
          linha[coluna.campo] = null;
        } else {
          throw new Error(`Coluna obrigatoria ${tabela}.${coluna.coluna} ausente no backup.`);
        }
      }
      linhas[modelo].push(linha);
    }
  }

  // Migration 20261024234922: backup anterior aos perfis ganha os 3 perfis
  // padrao, e quem ja estava cadastrado vira "Professor".
  if (!copies.has('perfis')) {
    const agora = new Date();
    linhas.perfil = PERFIS_PADRAO.map((perfil) => ({
      id: randomUUID(),
      nome: perfil.nome,
      descricao: perfil.descricao,
      ativo: true,
      createdAt: agora,
      updatedAt: agora,
    }));
    const professorId = linhas.perfil[0]!.id;
    let vinculados = 0;
    for (const professor of linhas.professor) {
      if (professor.perfilId === null) {
        professor.perfilId = professorId;
        vinculados += 1;
      }
    }
    avisos.push(
      `Backup anterior aos perfis: criados ${linhas.perfil.length} perfis padrao e ${vinculados} usuario(s) vinculados a "Professor".`,
    );
  }

  validar(linhas, avisos);
  return { linhas, avisos, ignoradas };
}

function validar(linhas: Record<NomeModelo, Linha[]>, avisos: string[]): void {
  // Unicidade (incluindo id).
  for (const modelo of MODELOS) {
    for (const campo of ['id', ...TABELAS[modelo].unicos]) {
      const vistos = new Set<unknown>();
      for (const linha of linhas[modelo]) {
        const valor = linha[campo];
        if (valor === null) continue;
        if (vistos.has(valor)) {
          throw new Error(`Valor repetido em ${TABELAS[modelo].aba}.${campo}; importacao abortada.`);
        }
        vistos.add(valor);
      }
    }
  }

  // Referencias obrigatorias.
  const ids = (modelo: NomeModelo) => new Set(linhas[modelo].map((linha) => linha.id));
  const professores = ids('professor');
  for (const registro of linhas.registroPonto) {
    if (!professores.has(registro.professorId)) {
      throw new Error(`Registro de ponto ${String(registro.id)} aponta para professor inexistente.`);
    }
  }

  // Referencias opcionais quebradas so geram aviso (o banco antigo usaria SET NULL).
  const opcionais: Array<[NomeModelo, string, NomeModelo]> = [
    ['registroPonto', 'campusId', 'campus'],
    ['registroPonto', 'decididoPor', 'admin'],
    ['refreshToken', 'professorId', 'professor'],
    ['refreshToken', 'adminId', 'admin'],
    ['logAuditoria', 'professorId', 'professor'],
    ['logAuditoria', 'adminId', 'admin'],
    ['professor', 'perfilId', 'perfil'],
  ];
  for (const [modelo, campo, alvo] of opcionais) {
    const existentes = ids(alvo);
    const quebradas = linhas[modelo].filter(
      (linha) => linha[campo] !== null && !existentes.has(linha[campo]),
    ).length;
    if (quebradas) {
      avisos.push(`${quebradas} linha(s) de ${TABELAS[modelo].aba}.${campo} apontam para ${alvo} inexistente (mantidas como estao).`);
    }
  }

  // Ida e volta pela codificacao da planilha: prova que nenhum valor muda.
  for (const modelo of MODELOS) {
    for (const linha of linhas[modelo]) {
      const volta = planilhaParaLinha(TABELAS[modelo], linhaParaPlanilha(TABELAS[modelo], linha));
      if (!isDeepStrictEqual(volta, linha)) {
        throw new Error(
          `Linha ${String(linha.id)} de ${TABELAS[modelo].aba} nao sobrevive a codificacao da planilha.`,
        );
      }
    }
  }
}
