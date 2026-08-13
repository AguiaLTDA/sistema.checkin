import type { RelatorioJornada } from '@univc/shared';
import { useCallback, useEffect, useState } from 'react';
import { ErroRequisicao } from '../api/cliente';
import { buscarRelatorioJornada } from '../api/consultas';
import {
  FILTRO_VAZIO,
  FiltrosRegistros,
  type ValoresFiltro,
} from '../componentes/FiltrosRegistros';
import { Alerta, Botao, Cartao, Vazio } from '../componentes/ui';
import { baixarCsv, relatorioParaCsv } from '../lib/csv';
import { formatarDataCivil, formatarHora, hojeCivil } from '../lib/formato';

export function Jornada() {
  const [filtros, setFiltros] = useState<ValoresFiltro>({
    ...FILTRO_VAZIO,
    data_inicio: hojeCivil(-30),
    data_fim: hojeCivil(),
  });
  const [relatorio, setRelatorio] = useState<RelatorioJornada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!filtros.data_inicio || !filtros.data_fim) {
      setErro('Informe o periodo (de / ate) para gerar o relatorio.');
      return;
    }

    setCarregando(true);
    setErro(null);
    try {
      setRelatorio(
        await buscarRelatorioJornada({
          data_inicio: filtros.data_inicio,
          data_fim: filtros.data_fim,
          professor_id: filtros.professor_id || undefined,
          curso: filtros.curso || undefined,
        }),
      );
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Falha ao gerar o relatorio de jornada.',
      );
    } finally {
      setCarregando(false);
    }
  }, [filtros.data_inicio, filtros.data_fim, filtros.professor_id, filtros.curso]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalInconsistencias =
    relatorio?.professores.reduce(
      (soma, linha) => soma + linha.total_inconsistencias,
      0,
    ) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Cartao titulo="Periodo e filtros">
        <FiltrosRegistros
          valores={filtros}
          aoMudar={setFiltros}
          camposOcultos={['status', 'tipo']}
        />
      </Cartao>

      {erro && <Alerta>{erro}</Alerta>}

      {totalInconsistencias > 0 && (
        <Alerta tom="aviso">
          {totalInconsistencias} inconsistencia(s) no periodo — chegadas sem
          saida, saidas sem chegada ou registros ainda pendentes de aprovacao.
        </Alerta>
      )}

      <Cartao
        titulo="Relatorio de jornada"
        acoes={
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={() => void carregar()}>
              Recarregar
            </Botao>
            <Botao
              disabled={!relatorio}
              onClick={() =>
                relatorio &&
                baixarCsv(
                  `jornada_${relatorio.periodo.data_inicio}_a_${relatorio.periodo.data_fim}.csv`,
                  relatorioParaCsv(relatorio),
                )
              }
            >
              Exportar CSV
            </Botao>
          </div>
        }
      >
        {carregando && (
          <p className="py-8 text-center text-sm text-slate-500">Gerando...</p>
        )}

        {!carregando && relatorio && relatorio.professores.length === 0 && (
          <Vazio>Nenhum professor encontrado com esses filtros.</Vazio>
        )}

        {!carregando &&
          relatorio?.professores.map((linha) => (
            <div
              key={linha.professor.id}
              className="mb-6 last:mb-0 rounded-lg ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {linha.professor.nome}
                  </p>
                  <p className="text-xs text-slate-500">
                    {linha.professor.curso_vinculado} — {linha.professor.email}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-semibold text-slate-700">
                    {linha.horas_trabalhadas_total} no periodo
                  </span>
                  {linha.total_inconsistencias > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-600/30">
                      {linha.total_inconsistencias} inconsistencia(s)
                    </span>
                  )}
                </div>
              </div>

              {linha.dias.length === 0 ? (
                <Vazio>Sem registros no periodo.</Vazio>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2 font-semibold">Dia</th>
                      <th className="px-4 py-2 font-semibold">Pares</th>
                      <th className="px-4 py-2 font-semibold">Horas</th>
                      <th className="px-4 py-2 font-semibold">Alertas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linha.dias.map((dia) => (
                      <tr
                        key={dia.data}
                        className={
                          dia.inconsistencias.length > 0 ? 'bg-amber-50/60' : ''
                        }
                      >
                        <td className="px-4 py-3 align-top font-medium text-slate-700">
                          {formatarDataCivil(dia.data)}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {dia.pares.map((par, indice) => (
                            <div key={indice}>
                              {par.chegada
                                ? formatarHora(par.chegada.horario)
                                : '—'}{' '}
                              →{' '}
                              {par.saida ? formatarHora(par.saida.horario) : '—'}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 align-top font-medium text-slate-700">
                          {dia.horas_trabalhadas}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {dia.inconsistencias.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <ul className="list-disc pl-4 text-xs text-amber-900">
                              {dia.inconsistencias.map((problema, indice) => (
                                <li key={indice}>{problema.descricao}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
      </Cartao>
    </div>
  );
}
