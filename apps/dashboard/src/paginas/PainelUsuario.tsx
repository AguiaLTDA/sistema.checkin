import type {
  RegistroPontoDTO,
  RespostaPaginada,
  TipoRegistro,
} from '@univc/shared';
import { ROTULOS_TIPO } from '@univc/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErroRequisicao } from '../api/cliente';
import {
  buscarUltimo,
  listarHistorico,
  registrarPonto,
  type RespostaCheckin,
  type UltimoRegistro,
} from '../api/usuario';
import { Alerta, Botao, Cartao, EtiquetaStatus, Vazio } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';
import { formatarDataHora, formatarDistancia } from '../lib/formato';

const POR_PAGINA = 10;

/** Le a posicao do navegador. Rejeita com mensagem pronta para a tela. */
function lerPosicao(): Promise<GeolocationPosition> {
  return new Promise((resolver, rejeitar) => {
    if (!('geolocation' in navigator)) {
      rejeitar(new Error('Este navegador nao oferece localizacao.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolver, (erro) => {
      rejeitar(
        new Error(
          erro.code === erro.PERMISSION_DENIED
            ? 'Permita o acesso a localizacao no navegador para registrar o ponto.'
            : 'Nao foi possivel obter sua localizacao. Tente novamente.',
        ),
      );
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

/**
 * Painel web de quem bate ponto: mesmo fluxo do app mobile (ultimo registro,
 * chegada/saida com localizacao e historico), direto do navegador.
 */
export function PainelUsuario() {
  const { usuario, sair } = useAuth('usuario');

  const [ultimo, setUltimo] = useState<UltimoRegistro | null>(null);
  const [historico, setHistorico] =
    useState<RespostaPaginada<RegistroPontoDTO> | null>(null);
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaCheckin | null>(null);
  const [registrando, setRegistrando] = useState<TipoRegistro | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [respostaUltimo, respostaHistorico] = await Promise.all([
        buscarUltimo(),
        listarHistorico(pagina, POR_PAGINA),
      ]);
      setUltimo(respostaUltimo);
      setHistorico(respostaHistorico);
    } catch (falha) {
      if (falha instanceof ErroRequisicao && falha.status === 401) {
        await sair();
        return;
      }
      setErro(
        falha instanceof ErroRequisicao ? falha.message : 'Falha ao carregar seus registros.',
      );
    }
  }, [pagina, sair]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcar(tipo: TipoRegistro) {
    setErro(null);
    setResultado(null);
    setRegistrando(tipo);
    try {
      const posicao = await lerPosicao();
      const resposta = await registrarPonto({
        tipo,
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
        precisao_metros: posicao.coords.accuracy,
      });
      setResultado(resposta);
      setPagina(1);
      await carregar();
    } catch (falha) {
      setErro(
        falha instanceof Error ? falha.message : 'Nao foi possivel registrar o ponto.',
      );
    } finally {
      setRegistrando(null);
    }
  }

  const proximo = ultimo?.proximo_tipo_esperado ?? 'CHEGADA';
  const totalPaginas = historico?.paginacao.total_paginas ?? 1;

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-emerald-800 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="block">
            <p className="text-lg font-semibold">UNIVC Check-in · Painel do Usuario</p>
            <p className="text-xs text-emerald-100">Registro de presenca</p>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              to="/rh"
              className="rounded-lg bg-white px-3 py-1.5 font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
            >
              Painel do RH →
            </Link>
            <button
              type="button"
              onClick={() => void sair()}
              className="rounded-lg bg-white/10 px-3 py-1.5 font-medium transition hover:bg-white/20"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-sm text-slate-500">Ola,</p>
            <p className="text-xl font-semibold text-slate-900">{usuario?.nome}</p>
            <p className="text-sm text-slate-500">{usuario?.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900">
              {usuario?.perfil ?? 'Sem perfil'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {usuario?.curso_vinculado}
            </span>
          </div>
        </section>

        <Cartao titulo="Registrar ponto">
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <p className="text-sm text-slate-600">
              Proximo registro esperado:{' '}
              <strong className="text-slate-900">{ROTULOS_TIPO[proximo]}</strong>
            </p>
            <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
              {(['CHEGADA', 'SAIDA'] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  disabled={tipo !== proximo || registrando !== null}
                  onClick={() => void marcar(tipo)}
                  className={`rounded-xl px-6 py-4 text-lg font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    tipo === 'CHEGADA'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-sky-600 hover:bg-sky-700'
                  }`}
                >
                  {registrando === tipo
                    ? 'Obtendo localizacao...'
                    : `Marcar ${ROTULOS_TIPO[tipo].toLowerCase()}`}
                </button>
              ))}
            </div>
            <p className="max-w-lg text-xs text-slate-500">
              O horario e sempre o do servidor e a presenca e comprovada apenas
              pela sua localizacao: dentro do raio do campus o registro e
              validado na hora; fora dele, segue para aprovacao do RH.
            </p>
          </div>

          {resultado && (
            <div className="mt-4">
              <Alerta tom={resultado.registro.status === 'VALIDADO' ? 'info' : 'aviso'}>
                <strong>
                  {ROTULOS_TIPO[resultado.registro.tipo]} registrada as{' '}
                  {formatarDataHora(resultado.registro.timestamp_servidor)}.
                </strong>{' '}
                {resultado.mensagem} Distancia ate o campus:{' '}
                {formatarDistancia(resultado.registro.distancia_do_campus_metros)}.
              </Alerta>
            </div>
          )}
          {erro && (
            <div className="mt-4">
              <Alerta>{erro}</Alerta>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Ultimo registro">
          {ultimo?.ultimo ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="font-semibold text-slate-800">
                {ROTULOS_TIPO[ultimo.ultimo.tipo]}
              </span>
              <span className="text-slate-600">
                {formatarDataHora(ultimo.ultimo.timestamp_servidor)}
              </span>
              <span className="text-slate-600">
                {ultimo.ultimo.campus?.nome ?? 'sem campus'} ·{' '}
                {formatarDistancia(ultimo.ultimo.distancia_do_campus_metros)}
              </span>
              <EtiquetaStatus status={ultimo.ultimo.status} />
            </div>
          ) : (
            <Vazio>Voce ainda nao tem registros. Comece marcando sua chegada.</Vazio>
          )}
        </Cartao>

        <Cartao
          titulo={`Meu historico${historico ? ` (${historico.paginacao.total})` : ''}`}
        >
          {!historico || historico.dados.length === 0 ? (
            <Vazio>Nenhum registro ainda.</Vazio>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Horario (servidor)</th>
                      <th className="px-3 py-2 font-semibold">Distancia</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historico.dados.map((registro) => (
                      <tr key={registro.id} className="align-top">
                        <td
                          className={`px-3 py-3 font-medium ${
                            registro.tipo === 'CHEGADA' ? 'text-emerald-700' : 'text-sky-700'
                          }`}
                        >
                          {ROTULOS_TIPO[registro.tipo]}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatarDataHora(registro.timestamp_servidor)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {formatarDistancia(registro.distancia_do_campus_metros)}
                          <p className="text-xs text-slate-400">
                            {registro.campus?.nome ?? 'sem campus'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <EtiquetaStatus status={registro.status} />
                          {registro.justificativa_manual && (
                            <p className="mt-1 max-w-xs text-xs text-slate-500">
                              RH: {registro.justificativa_manual}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPaginas > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                  <Botao
                    variante="secundario"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                  >
                    Anterior
                  </Botao>
                  <span>
                    Pagina {pagina} de {totalPaginas}
                  </span>
                  <Botao
                    variante="secundario"
                    disabled={pagina >= totalPaginas}
                    onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
                  >
                    Proxima
                  </Botao>
                </div>
              )}
            </>
          )}
        </Cartao>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        A presenca e comprovada apenas pela localizacao. Nenhum dado biometrico e coletado ou armazenado.
      </footer>
    </div>
  );
}
