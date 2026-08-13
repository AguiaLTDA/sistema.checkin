import type { RelatorioJornada } from '@univc/shared';
import { formatarDataCivil, formatarHora } from './formato';

/** Escapa um campo para CSV (aspas duplicadas e envelope quando necessario). */
function campo(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Converte o relatorio de jornada em CSV com uma linha por par
 * chegada/saida. Usa ';' como separador, que e o que o Excel em pt-BR espera.
 */
export function relatorioParaCsv(relatorio: RelatorioJornada): string {
  const linhas: string[] = [
    [
      'Professor',
      'Curso',
      'Data',
      'Chegada',
      'Saida',
      'Horas do par',
      'Horas no dia',
      'Inconsistencias',
    ]
      .map(campo)
      .join(';'),
  ];

  for (const linha of relatorio.professores) {
    if (linha.dias.length === 0) {
      linhas.push(
        [
          campo(linha.professor.nome),
          campo(linha.professor.curso_vinculado),
          campo('—'),
          campo('—'),
          campo('—'),
          campo('—'),
          campo('00:00'),
          campo('sem registros no periodo'),
        ].join(';'),
      );
      continue;
    }

    for (const dia of linha.dias) {
      const alertas = dia.inconsistencias
        .map((problema) => problema.descricao)
        .join(' | ');

      if (dia.pares.length === 0) {
        linhas.push(
          [
            campo(linha.professor.nome),
            campo(linha.professor.curso_vinculado),
            campo(formatarDataCivil(dia.data)),
            campo('—'),
            campo('—'),
            campo('—'),
            campo(dia.horas_trabalhadas),
            campo(alertas),
          ].join(';'),
        );
        continue;
      }

      for (const par of dia.pares) {
        linhas.push(
          [
            campo(linha.professor.nome),
            campo(linha.professor.curso_vinculado),
            campo(formatarDataCivil(dia.data)),
            campo(par.chegada ? formatarHora(par.chegada.horario) : '—'),
            campo(par.saida ? formatarHora(par.saida.horario) : '—'),
            campo(
              par.minutos_trabalhados === null
                ? '—'
                : minutosParaHoras(par.minutos_trabalhados),
            ),
            campo(dia.horas_trabalhadas),
            campo(alertas),
          ].join(';'),
        );
      }
    }

    linhas.push(
      [
        campo(linha.professor.nome),
        campo(linha.professor.curso_vinculado),
        campo('TOTAL'),
        campo(''),
        campo(''),
        campo(''),
        campo(linha.horas_trabalhadas_total),
        campo(`${linha.total_inconsistencias} inconsistencia(s)`),
      ].join(';'),
    );
  }

  return linhas.join('\n');
}

function minutosParaHoras(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** Dispara o download do CSV com BOM, para o Excel abrir os acentos certos. */
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob([`﻿${conteudo}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
