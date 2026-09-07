import type { RegistroPontoDTO } from '@univc/shared';
import { useCallback, useEffect, useState } from 'react';
import { ErroRequisicao } from '../api/cliente';
import { decidirRegistro, listarRegistros } from '../api/consultas';
import {
  FILTRO_VAZIO,
  FiltrosRegistros,
  type ValoresFiltro,
} from '../componentes/FiltrosRegistros';
import { TabelaRegistros } from '../componentes/TabelaRegistros';
import { Alerta, Botao, Cartao, classesInput } from '../componentes/ui';

const MINIMO_JUSTIFICATIVA = 10;

export function Pendentes() {
  const [filtros, setFiltros] = useState<ValoresFiltro>({ ...FILTRO_VAZIO });
  const [registros, setRegistros] = useState<RegistroPontoDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [emDecisao, setEmDecisao] = useState<RegistroPontoDTO | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await listarRegistros({
        ...filtros,
        status: 'PENDENTE_APROVACAO',
        pagina: 1,
        por_pagina: 100,
      });
      setRegistros(resposta.dados);
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Falha ao carregar os registros pendentes.',
      );
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(decisao: 'aprovar' | 'rejeitar') {
    if (!emDecisao) return;
    setSalvando(true);
    setErro(null);
    try {
      await decidirRegistro(emDecisao.id, decisao, justificativa.trim());
      setAviso(
        `Registro ${decisao === 'aprovar' ? 'aprovado' : 'rejeitado'} com sucesso.`,
      );
      setEmDecisao(null);
      setJustificativa('');
      await carregar();
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel registrar a decisao.',
      );
    } finally {
      setSalvando(false);
    }
  }

  const justificativaValida =
    justificativa.trim().length >= MINIMO_JUSTIFICATIVA;

  return (
    <div className="flex flex-col gap-6">
      <Alerta tom="info">
        Registros ficam pendentes quando o professor estava fora do raio do
        campus, quando nao ha campus cadastrado para comparar a localizacao ou
        quando o ponto foi sincronizado depois de um periodo offline. A
        aprovacao exige justificativa, que fica gravada na trilha de auditoria.
      </Alerta>

      <Cartao titulo="Filtros">
        <FiltrosRegistros
          valores={filtros}
          aoMudar={setFiltros}
          camposOcultos={['status']}
        />
      </Cartao>

      {emDecisao && (
        <Cartao titulo="Decidir registro">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              <strong>{emDecisao.professor?.nome}</strong> —{' '}
              {emDecisao.tipo === 'CHEGADA' ? 'Chegada' : 'Saida'} a{' '}
              {Math.round(emDecisao.distancia_do_campus_metros)} m do campus.
            </p>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">
                Justificativa (obrigatoria, minimo {MINIMO_JUSTIFICATIVA}{' '}
                caracteres)
              </span>
              <textarea
                className={`${classesInput} min-h-24`}
                value={justificativa}
                onChange={(evento) => setJustificativa(evento.target.value)}
                placeholder="Ex.: aula ministrada no anexo do forum, fora da geocerca, confirmada pela coordenacao."
                maxLength={500}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Botao
                disabled={!justificativaValida || salvando}
                onClick={() => void decidir('aprovar')}
              >
                Aprovar registro
              </Botao>
              <Botao
                variante="perigo"
                disabled={!justificativaValida || salvando}
                onClick={() => void decidir('rejeitar')}
              >
                Rejeitar registro
              </Botao>
              <Botao
                variante="secundario"
                onClick={() => {
                  setEmDecisao(null);
                  setJustificativa('');
                }}
              >
                Cancelar
              </Botao>
            </div>
          </div>
        </Cartao>
      )}

      <Cartao titulo={`Pendentes de aprovacao (${registros.length})`}>
        {erro && <Alerta>{erro}</Alerta>}
        {aviso && !erro && <Alerta tom="info">{aviso}</Alerta>}

        {carregando ? (
          <p className="py-8 text-center text-sm text-slate-500">Carregando...</p>
        ) : (
          <TabelaRegistros
            registros={registros}
            acoes={(registro) => (
              <Botao
                variante="secundario"
                onClick={() => {
                  setEmDecisao(registro);
                  setJustificativa('');
                  setAviso(null);
                }}
              >
                Decidir
              </Botao>
            )}
          />
        )}
      </Cartao>
    </div>
  );
}
