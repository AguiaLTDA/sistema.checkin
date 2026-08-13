import type { RegistroPontoDTO } from '@univc/shared';
import { ROTULOS_METODO_BIOMETRICO, ROTULOS_TIPO } from '@univc/shared';
import type { ReactNode } from 'react';
import { formatarDataHora, formatarDistancia } from '../lib/formato';
import { EtiquetaStatus, Vazio } from './ui';

interface Props {
  registros: RegistroPontoDTO[];
  acoes?: (registro: RegistroPontoDTO) => ReactNode;
}

export function TabelaRegistros({ registros, acoes }: Props) {
  if (registros.length === 0) {
    return <Vazio>Nenhum registro encontrado com os filtros atuais.</Vazio>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Professor</th>
            <th className="px-3 py-2 font-semibold">Curso</th>
            <th className="px-3 py-2 font-semibold">Tipo</th>
            <th className="px-3 py-2 font-semibold">Horario (servidor)</th>
            <th className="px-3 py-2 font-semibold">Distancia</th>
            <th className="px-3 py-2 font-semibold">Biometria</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            {acoes && <th className="px-3 py-2 font-semibold">Acoes</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {registros.map((registro) => (
            <tr key={registro.id} className="align-top hover:bg-slate-50">
              <td className="px-3 py-3">
                <p className="font-medium text-slate-800">
                  {registro.professor?.nome ?? '—'}
                </p>
                <p className="text-xs text-slate-500">
                  {registro.professor?.email}
                </p>
              </td>
              <td className="px-3 py-3 text-slate-600">
                {registro.professor?.curso_vinculado ?? '—'}
              </td>
              <td className="px-3 py-3">
                <span
                  className={
                    registro.tipo === 'CHEGADA'
                      ? 'font-medium text-emerald-700'
                      : 'font-medium text-sky-700'
                  }
                >
                  {ROTULOS_TIPO[registro.tipo]}
                </span>
              </td>
              <td className="px-3 py-3 text-slate-700">
                {formatarDataHora(registro.timestamp_servidor)}
                {registro.sincronizado_offline && (
                  <p className="text-xs text-amber-700">
                    offline; declarado{' '}
                    {registro.registrado_offline_em
                      ? formatarDataHora(registro.registrado_offline_em)
                      : '—'}
                  </p>
                )}
              </td>
              <td className="px-3 py-3">
                <span
                  className={
                    registro.dentro_do_raio ? 'text-slate-600' : 'text-rose-700'
                  }
                >
                  {formatarDistancia(registro.distancia_do_campus_metros)}
                </span>
                <p className="text-xs text-slate-400">
                  {registro.campus?.nome ?? 'sem campus'}
                </p>
              </td>
              <td className="px-3 py-3 text-slate-600">
                {ROTULOS_METODO_BIOMETRICO[registro.metodo_biometrico]}
              </td>
              <td className="px-3 py-3">
                <EtiquetaStatus status={registro.status} />
                {registro.justificativa_manual && (
                  <p className="mt-1 max-w-xs text-xs text-slate-500">
                    {registro.justificativa_manual}
                  </p>
                )}
              </td>
              {acoes && <td className="px-3 py-3">{acoes(registro)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
