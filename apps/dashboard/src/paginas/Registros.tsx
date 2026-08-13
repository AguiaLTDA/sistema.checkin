import type { RegistroPontoDTO, RespostaPaginada } from '@univc/shared';
import { useCallback, useEffect, useState } from 'react';
import { ErroRequisicao } from '../api/cliente';
import { listarRegistros } from '../api/consultas';
import {
  FILTRO_VAZIO,
  FiltrosRegistros,
  type ValoresFiltro,
} from '../componentes/FiltrosRegistros';
import { TabelaRegistros } from '../componentes/TabelaRegistros';
import { Alerta, Botao, Cartao } from '../componentes/ui';

const POR_PAGINA = 20;

export function Registros() {
  const [filtros, setFiltros] = useState<ValoresFiltro>({ ...FILTRO_VAZIO });
  const [pagina, setPagina] = useState(1);
  const [resposta, setResposta] =
    useState<RespostaPaginada<RegistroPontoDTO> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setResposta(
        await listarRegistros({ ...filtros, pagina, por_pagina: POR_PAGINA }),
      );
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Falha ao carregar os registros.',
      );
    } finally {
      setCarregando(false);
    }
  }, [filtros, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalPaginas = resposta?.paginacao.total_paginas ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <Cartao titulo="Filtros">
        <FiltrosRegistros
          valores={filtros}
          aoMudar={(novos) => {
            setPagina(1);
            setFiltros(novos);
          }}
        />
      </Cartao>

      <Cartao
        titulo={`Registros de ponto${
          resposta ? ` (${resposta.paginacao.total})` : ''
        }`}
        acoes={
          <Botao variante="secundario" onClick={() => void carregar()}>
            Atualizar
          </Botao>
        }
      >
        {erro && <Alerta>{erro}</Alerta>}
        {carregando && !resposta ? (
          <p className="py-8 text-center text-sm text-slate-500">Carregando...</p>
        ) : (
          <>
            <TabelaRegistros registros={resposta?.dados ?? []} />

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
                  onClick={() =>
                    setPagina((atual) => Math.min(totalPaginas, atual + 1))
                  }
                >
                  Proxima
                </Botao>
              </div>
            )}
          </>
        )}
      </Cartao>
    </div>
  );
}
