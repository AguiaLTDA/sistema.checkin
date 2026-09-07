import type { RegistroPontoDTO } from '@univc/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ErroApi,
  ErroDeRede,
  buscarUltimoRegistro,
  enviarCheckin,
} from '../api/cliente';
import { Aviso, Botao, Cartao, EtiquetaStatus } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';
import { obterLocalizacao } from '../lib/geolocalizacao';
import { formatarDataHora, formatarDistancia } from '../lib/formato';

type TipoRegistro = 'CHEGADA' | 'SAIDA';
type Retorno = { tom: 'sucesso' | 'atencao' | 'erro'; texto: string } | null;

export function Principal() {
  const { usuario, sair } = useAuth();

  const [proximoTipo, setProximoTipo] = useState<TipoRegistro>('CHEGADA');
  const [ultimo, setUltimo] = useState<RegistroPontoDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);

  const carregarEstado = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await buscarUltimoRegistro();
      setUltimo(resposta.ultimo);
      setProximoTipo(resposta.proximo_tipo_esperado);
    } catch {
      // Mantem o ultimo estado conhecido na tela; os botoes so reagem de
      // verdade a resposta do POST /checkin.
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarEstado();
  }, [carregarEstado]);

  /**
   * Fluxo completo: localizacao -> envio. A localizacao e a unica prova de
   * presenca do sistema; sem ela o registro nao acontece. Nao ha etapa de
   * biometria.
   */
  async function registrar(tipo: TipoRegistro) {
    if (processando) return;

    setRetorno(null);
    setProcessando(true);

    try {
      const localizacao = await obterLocalizacao();
      if (!localizacao.ok) {
        setRetorno({ tom: 'erro', texto: localizacao.mensagem });
        return;
      }

      try {
        const resposta = await enviarCheckin({
          tipo,
          latitude: localizacao.posicao.latitude,
          longitude: localizacao.posicao.longitude,
          precisao_metros: localizacao.posicao.precisaoMetros,
        });

        setUltimo(resposta.registro);
        setProximoTipo(tipo === 'CHEGADA' ? 'SAIDA' : 'CHEGADA');

        setRetorno({
          tom: resposta.registro.status === 'VALIDADO' ? 'sucesso' : 'atencao',
          // O horario exibido e o que o servidor devolveu, nao o relogio local.
          texto: `${resposta.mensagem}\nHorario registrado pelo servidor: ${formatarDataHora(
            resposta.registro.timestamp_servidor,
          )} (${formatarDistancia(resposta.registro.distancia_do_campus_metros)}).`,
        });
      } catch (falha) {
        if (falha instanceof ErroDeRede) {
          setRetorno({
            tom: 'erro',
            texto:
              'Sem internet agora. Tente novamente assim que a conexao voltar — o horario oficial e sempre o do servidor no momento do envio.',
          });
          return;
        }

        setRetorno({
          tom: 'erro',
          texto:
            falha instanceof ErroApi
              ? falha.message
              : 'Nao foi possivel registrar o ponto.',
        });
      }
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xl font-extrabold text-slate-900">
            Ola, {usuario?.nome.split(' ')[0]}
          </p>
          <p className="text-sm text-slate-500">{usuario?.curso_vinculado}</p>
        </div>
        <Botao
          type="button"
          variante="secundario"
          onClick={() => void sair()}
          className="!min-h-0 !w-auto px-3 py-2 text-sm"
        >
          Sair
        </Botao>
      </header>

      {retorno && <Aviso tom={retorno.tom}>{retorno.texto}</Aviso>}

      <div className="flex flex-col gap-3">
        <Botao
          onClick={() => void registrar('CHEGADA')}
          disabled={proximoTipo !== 'CHEGADA' || carregando}
          carregando={processando && proximoTipo === 'CHEGADA'}
        >
          Marcar chegada
        </Botao>
        <Botao
          onClick={() => void registrar('SAIDA')}
          disabled={proximoTipo !== 'SAIDA' || carregando}
          carregando={processando && proximoTipo === 'SAIDA'}
        >
          Marcar saida
        </Botao>
        <p className="text-center text-xs text-slate-500">
          {proximoTipo === 'CHEGADA'
            ? 'Seu proximo registro deve ser uma chegada.'
            : 'Voce ja registrou a chegada. O proximo registro e a saida.'}
        </p>
      </div>

      {ultimo && (
        <Cartao titulo="Ultimo registro">
          <p className="text-base text-slate-800">
            {ultimo.tipo === 'CHEGADA' ? 'Chegada' : 'Saida'} —{' '}
            {formatarDataHora(ultimo.timestamp_servidor)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {formatarDistancia(ultimo.distancia_do_campus_metros)}
          </p>
          <div className="mt-2">
            <EtiquetaStatus status={ultimo.status} />
          </div>
        </Cartao>
      )}

      <Link to="/historico">
        <Botao type="button" variante="secundario">
          Ver historico
        </Botao>
      </Link>

      <p className="mt-2 text-center text-xs text-slate-400">
        O registro usa apenas a sua localizacao no momento em que voce toca no
        botao, para confirmar que voce esta no campus. Nenhum dado biometrico
        e lido ou enviado.
      </p>
    </div>
  );
}
