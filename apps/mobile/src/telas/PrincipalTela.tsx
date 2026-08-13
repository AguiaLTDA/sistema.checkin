import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ErroApi,
  ErroDeRede,
  buscarUltimoRegistro,
  enviarCheckin,
} from '../api/cliente';
import { Aviso, Botao, Cartao, EtiquetaStatus } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';
import { useFilaOffline } from '../contexto/FilaOfflineContext';
import {
  autenticarBiometria,
  obterLocalizacao,
  verificarBiometria,
} from '../lib/dispositivo';
import { CORES, formatarDataHora, formatarDistancia } from '../lib/formato';
import type { MetodoBiometrico, RegistroPontoDTO, TipoRegistro } from '../tipos';

const MAXIMO_TENTATIVAS_BIOMETRIA = 3;
const BLOQUEIO_SEGUNDOS = 60;
const CHAVE_PROXIMO_TIPO = 'univc.proximo_tipo';

type Retorno =
  | { tom: 'sucesso' | 'atencao' | 'erro' | 'info'; texto: string }
  | null;

export function PrincipalTela({ irParaHistorico }: { irParaHistorico: () => void }) {
  const { usuario, sair } = useAuth();
  const { pendentes, online, sincronizando, guardar, sincronizar } =
    useFilaOffline();

  const [proximoTipo, setProximoTipo] = useState<TipoRegistro>('CHEGADA');
  const [ultimo, setUltimo] = useState<RegistroPontoDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);
  const [biometriaIndisponivel, setBiometriaIndisponivel] = useState<string | null>(
    null,
  );

  const tentativasBiometria = useRef(0);
  const [segundosBloqueado, setSegundosBloqueado] = useState(0);

  // Contagem regressiva do bloqueio apos 3 falhas de biometria.
  useEffect(() => {
    if (segundosBloqueado <= 0) return;
    const intervalo = setInterval(
      () => setSegundosBloqueado((atual) => Math.max(0, atual - 1)),
      1000,
    );
    return () => clearInterval(intervalo);
  }, [segundosBloqueado]);

  useEffect(() => {
    void verificarBiometria().then((capacidade) =>
      setBiometriaIndisponivel(capacidade.disponivel ? null : capacidade.motivo ?? null),
    );
  }, []);

  /**
   * Busca no servidor qual e o proximo registro esperado. O valor fica em cache
   * no aparelho para os botoes continuarem coerentes mesmo sem conexao.
   */
  const carregarEstado = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await buscarUltimoRegistro();
      setUltimo(resposta.ultimo);
      setProximoTipo(resposta.proximo_tipo_esperado);
      await AsyncStorage.setItem(
        CHAVE_PROXIMO_TIPO,
        resposta.proximo_tipo_esperado,
      );
    } catch {
      const cache = await AsyncStorage.getItem(CHAVE_PROXIMO_TIPO);
      if (cache === 'CHEGADA' || cache === 'SAIDA') setProximoTipo(cache);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarEstado();
  }, [carregarEstado]);

  // Depois de uma sincronizacao bem-sucedida o estado do servidor mudou.
  useEffect(() => {
    if (pendentes.length === 0) void carregarEstado();
  }, [pendentes.length, carregarEstado]);

  async function alternarProximoTipo(registrado: TipoRegistro) {
    const proximo: TipoRegistro = registrado === 'CHEGADA' ? 'SAIDA' : 'CHEGADA';
    setProximoTipo(proximo);
    await AsyncStorage.setItem(CHAVE_PROXIMO_TIPO, proximo);
  }

  /** Fluxo completo: localizacao -> biometria -> envio (ou fila offline). */
  async function registrar(tipo: TipoRegistro, comBiometria = true) {
    if (processando || segundosBloqueado > 0) return;

    setRetorno(null);
    setProcessando(true);

    try {
      const localizacao = await obterLocalizacao();
      if (!localizacao.ok) {
        setRetorno({ tom: 'erro', texto: localizacao.mensagem });
        return;
      }

      let metodo: MetodoBiometrico = 'NENHUM';

      if (comBiometria) {
        const biometria = await autenticarBiometria(tipo);

        if (!biometria.ok) {
          tentativasBiometria.current += 1;
          const restantes =
            MAXIMO_TENTATIVAS_BIOMETRIA - tentativasBiometria.current;

          if (restantes <= 0) {
            tentativasBiometria.current = 0;
            setSegundosBloqueado(BLOQUEIO_SEGUNDOS);
            setRetorno({
              tom: 'erro',
              texto: `Biometria falhou ${MAXIMO_TENTATIVAS_BIOMETRIA} vezes. Aguarde ${BLOQUEIO_SEGUNDOS} segundos para tentar de novo.`,
            });
          } else {
            setRetorno({
              tom: 'atencao',
              texto: `${biometria.mensagem} Voce ainda tem ${restantes} tentativa(s).`,
            });
          }
          return;
        }

        tentativasBiometria.current = 0;
        metodo = biometria.metodo;
      }

      const corpo = {
        tipo,
        latitude: localizacao.posicao.latitude,
        longitude: localizacao.posicao.longitude,
        precisao_metros: localizacao.posicao.precisaoMetros,
        metodo_biometrico: metodo,
      };

      try {
        const resposta = await enviarCheckin(corpo);
        setUltimo(resposta.registro);
        await alternarProximoTipo(tipo);

        setRetorno({
          tom: resposta.registro.status === 'VALIDADO' ? 'sucesso' : 'atencao',
          // O horario exibido e o que o servidor devolveu, nao o relogio local.
          texto: `${resposta.mensagem}\nHorario registrado pelo servidor: ${formatarDataHora(
            resposta.registro.timestamp_servidor,
          )} (${formatarDistancia(resposta.registro.distancia_do_campus_metros)}).`,
        });
      } catch (falha) {
        if (falha instanceof ErroDeRede) {
          await guardar({
            tipo,
            latitude: corpo.latitude,
            longitude: corpo.longitude,
            precisao_metros: corpo.precisao_metros,
            metodo_biometrico: metodo,
            registrado_offline_em: new Date().toISOString(),
          });
          await alternarProximoTipo(tipo);
          setRetorno({
            tom: 'atencao',
            texto:
              'Sem internet agora. O registro ficou guardado no aparelho e sera enviado sozinho quando a conexao voltar. O horario oficial sera confirmado pelo servidor.',
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

  const bloqueado = segundosBloqueado > 0;

  return (
    <ScrollView
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      refreshControl={
        <RefreshControl refreshing={carregando} onRefresh={() => void carregarEstado()} />
      }
    >
      <View style={estilos.cabecalho}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.saudacao}>Ola, {usuario?.nome.split(' ')[0]}</Text>
          <Text style={estilos.curso}>{usuario?.curso_vinculado}</Text>
        </View>
        <Botao titulo="Sair" variante="secundario" aoTocar={() => void sair()} />
      </View>

      {!online && (
        <Aviso tom="atencao">
          Voce esta sem conexao. Da para registrar o ponto normalmente: o envio
          acontece assim que a internet voltar.
        </Aviso>
      )}

      {pendentes.length > 0 && (
        <Cartao>
          <Text style={estilos.tituloCartao}>
            {pendentes.length} registro(s) pendente(s) de sincronizacao
          </Text>
          <Text style={estilos.textoFraco}>
            Guardados neste aparelho enquanto voce estava sem internet.
          </Text>
          <Botao
            titulo={sincronizando ? 'Enviando...' : 'Tentar enviar agora'}
            variante="secundario"
            carregando={sincronizando}
            aoTocar={() => void sincronizar()}
          />
        </Cartao>
      )}

      {biometriaIndisponivel && (
        <Aviso tom="atencao">
          {biometriaIndisponivel} Voce ainda pode registrar o ponto, mas ele ira
          para aprovacao manual do RH.
        </Aviso>
      )}

      {retorno && <Aviso tom={retorno.tom}>{retorno.texto}</Aviso>}

      {bloqueado && (
        <Aviso tom="erro">
          Novas tentativas liberadas em {segundosBloqueado}s.
        </Aviso>
      )}

      <View style={estilos.botoes}>
        <Botao
          titulo="Marcar chegada"
          aoTocar={() => void registrar('CHEGADA')}
          desabilitado={proximoTipo !== 'CHEGADA' || bloqueado}
          carregando={processando && proximoTipo === 'CHEGADA'}
        />
        <Botao
          titulo="Marcar saida"
          aoTocar={() => void registrar('SAIDA')}
          desabilitado={proximoTipo !== 'SAIDA' || bloqueado}
          carregando={processando && proximoTipo === 'SAIDA'}
        />
        <Text style={estilos.dica}>
          {proximoTipo === 'CHEGADA'
            ? 'Seu proximo registro deve ser uma chegada.'
            : 'Voce ja registrou a chegada. O proximo registro e a saida.'}
        </Text>
      </View>

      {biometriaIndisponivel && (
        <Botao
          titulo="Registrar sem biometria (vai para o RH)"
          variante="secundario"
          aoTocar={() => void registrar(proximoTipo, false)}
          desabilitado={processando || bloqueado}
        />
      )}

      {ultimo && (
        <Cartao>
          <Text style={estilos.tituloCartao}>Ultimo registro</Text>
          <Text style={estilos.linhaForte}>
            {ultimo.tipo === 'CHEGADA' ? 'Chegada' : 'Saida'} —{' '}
            {formatarDataHora(ultimo.timestamp_servidor)}
          </Text>
          <Text style={estilos.textoFraco}>
            {formatarDistancia(ultimo.distancia_do_campus_metros)}
          </Text>
          <EtiquetaStatus status={ultimo.status} />
        </Cartao>
      )}

      <Botao
        titulo="Ver historico"
        variante="secundario"
        aoTocar={irParaHistorico}
      />

      <Text style={estilos.rodape}>
        A confirmacao biometrica acontece dentro do seu aparelho. O sistema
        recebe apenas a informacao de que ela passou, junto da localizacao do
        momento do registro.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  conteudo: { gap: 16, padding: 20, paddingBottom: 40 },
  cabecalho: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  saudacao: { color: CORES.texto, fontSize: 22, fontWeight: '800' },
  curso: { color: CORES.textoFraco, fontSize: 14 },
  botoes: { gap: 12 },
  dica: { color: CORES.textoFraco, fontSize: 13, textAlign: 'center' },
  tituloCartao: { color: CORES.texto, fontSize: 15, fontWeight: '700' },
  linhaForte: { color: CORES.texto, fontSize: 16 },
  textoFraco: { color: CORES.textoFraco, fontSize: 13, lineHeight: 19 },
  rodape: {
    color: CORES.textoFraco,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
});
