import type { RegistroPontoDTO } from '@univc/shared';
import { ROTULOS_TIPO } from '@univc/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarHistorico } from '../api/cliente';
import { Aviso, Botao, EtiquetaStatus } from '../componentes/ui';
import { formatarDataHora, formatarDistancia } from '../lib/formato';

export function Historico() {
  const [registros, setRegistros] = useState<RegistroPontoDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await buscarHistorico();
      setRegistros(resposta.dados);
    } catch {
      setErro('Nao foi possivel carregar o historico agora.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3">
        <Link to="/">
          <Botao type="button" variante="secundario" className="!min-h-0 !w-auto px-3 py-2 text-sm">
            Voltar
          </Botao>
        </Link>
        <h1 className="text-lg font-bold text-slate-900">Meu historico</h1>
      </header>

      {erro && <Aviso tom="atencao">{erro}</Aviso>}

      {carregando && registros.length === 0 && (
        <p className="text-center text-sm text-slate-500">Carregando...</p>
      )}

      {!carregando && registros.length === 0 && !erro && (
        <p className="text-center text-sm text-slate-500">
          Nenhum registro enviado ainda.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {registros.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-slate-800">
                {ROTULOS_TIPO[item.tipo]}
              </span>
              <EtiquetaStatus status={item.status} />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {formatarDataHora(item.timestamp_servidor)}
            </p>
            <p className="text-xs text-slate-500">
              {formatarDistancia(item.distancia_do_campus_metros)}
              {item.sincronizado_offline ? ' — enviado apos uso offline' : ''}
            </p>
            {item.justificativa_manual && (
              <p className="mt-1 text-xs italic text-slate-500">
                RH: {item.justificativa_manual}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
