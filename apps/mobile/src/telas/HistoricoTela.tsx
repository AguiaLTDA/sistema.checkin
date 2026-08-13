import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { buscarHistorico } from '../api/cliente';
import { Aviso, EtiquetaStatus } from '../componentes/ui';
import { useFilaOffline } from '../contexto/FilaOfflineContext';
import { CORES, formatarDataHora, formatarDistancia } from '../lib/formato';
import { ROTULOS_TIPO, type RegistroPontoDTO } from '../tipos';

export function HistoricoTela() {
  const { pendentes } = useFilaOffline();
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
      setErro(
        'Nao foi possivel carregar o historico agora. Os registros guardados no aparelho continuam listados abaixo.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <FlatList
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      data={registros}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={carregando} onRefresh={() => void carregar()} />
      }
      ListHeaderComponent={
        <View style={estilos.cabecalho}>
          {erro && <Aviso tom="atencao">{erro}</Aviso>}

          {pendentes.length > 0 && (
            <View style={estilos.grupoPendentes}>
              <Text style={estilos.tituloSecao}>Aguardando sincronizacao</Text>
              {pendentes.map((item) => (
                <View key={item.id_local} style={[estilos.item, estilos.itemPendente]}>
                  <View style={estilos.itemTopo}>
                    <Text style={estilos.itemTipo}>{ROTULOS_TIPO[item.tipo]}</Text>
                    <View style={estilos.etiquetaPendente}>
                      <Text style={estilos.etiquetaPendenteTexto}>
                        Pendente de sincronizacao
                      </Text>
                    </View>
                  </View>
                  <Text style={estilos.itemDetalhe}>
                    Registrado no aparelho em{' '}
                    {formatarDataHora(item.registrado_offline_em)}
                  </Text>
                  <Text style={estilos.itemDetalhe}>
                    O horario oficial sera confirmado pelo servidor no envio.
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={estilos.tituloSecao}>Registros enviados</Text>
        </View>
      }
      ListEmptyComponent={
        carregando ? null : (
          <Text style={estilos.vazio}>Nenhum registro enviado ainda.</Text>
        )
      }
      renderItem={({ item }) => (
        <View style={estilos.item}>
          <View style={estilos.itemTopo}>
            <Text style={estilos.itemTipo}>{ROTULOS_TIPO[item.tipo]}</Text>
            <EtiquetaStatus status={item.status} />
          </View>
          <Text style={estilos.itemHorario}>
            {formatarDataHora(item.timestamp_servidor)}
          </Text>
          <Text style={estilos.itemDetalhe}>
            {formatarDistancia(item.distancia_do_campus_metros)}
            {item.sincronizado_offline ? ' — enviado apos uso offline' : ''}
          </Text>
          {item.justificativa_manual && (
            <Text style={estilos.itemJustificativa}>
              RH: {item.justificativa_manual}
            </Text>
          )}
        </View>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  conteudo: { gap: 10, padding: 20, paddingBottom: 40 },
  cabecalho: { gap: 14 },
  grupoPendentes: { gap: 10 },
  tituloSecao: {
    color: CORES.textoFraco,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  item: {
    backgroundColor: CORES.branco,
    borderColor: CORES.borda,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  itemPendente: { borderColor: '#FCD34D', borderStyle: 'dashed' },
  itemTopo: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  itemTipo: { color: CORES.texto, fontSize: 16, fontWeight: '700' },
  itemHorario: { color: CORES.texto, fontSize: 15 },
  itemDetalhe: { color: CORES.textoFraco, fontSize: 13 },
  itemJustificativa: { color: CORES.textoFraco, fontSize: 13, fontStyle: 'italic' },
  etiquetaPendente: {
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  etiquetaPendenteTexto: { color: '#78350F', fontSize: 12, fontWeight: '600' },
  vazio: { color: CORES.textoFraco, fontSize: 14, paddingVertical: 24, textAlign: 'center' },
});
