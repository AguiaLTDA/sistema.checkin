import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CORES, CORES_STATUS } from '../lib/formato';
import { ROTULOS_STATUS, type StatusRegistro } from '../tipos';

export function EtiquetaStatus({ status }: { status: StatusRegistro }) {
  const cores = CORES_STATUS[status];
  return (
    <View style={[estilos.etiqueta, { backgroundColor: cores.fundo }]}>
      <Text style={[estilos.etiquetaTexto, { color: cores.texto }]}>
        {ROTULOS_STATUS[status]}
      </Text>
    </View>
  );
}

export function Aviso({
  tom = 'info',
  children,
}: {
  tom?: 'info' | 'erro' | 'sucesso' | 'atencao';
  children: ReactNode;
}) {
  const paleta = {
    info: { fundo: '#E0F2FE', texto: '#075985' },
    erro: { fundo: '#FFE4E6', texto: '#9F1239' },
    sucesso: { fundo: '#D1FAE5', texto: '#065F46' },
    atencao: { fundo: '#FEF3C7', texto: '#78350F' },
  }[tom];

  return (
    <View style={[estilos.aviso, { backgroundColor: paleta.fundo }]}>
      <Text style={[estilos.avisoTexto, { color: paleta.texto }]}>{children}</Text>
    </View>
  );
}

export function Botao({
  titulo,
  aoTocar,
  desabilitado,
  carregando,
  variante = 'primario',
}: {
  titulo: string;
  aoTocar: () => void;
  desabilitado?: boolean;
  carregando?: boolean;
  variante?: 'primario' | 'secundario' | 'perigo';
}) {
  const cores = {
    primario: { fundo: CORES.primaria, texto: CORES.branco },
    secundario: { fundo: CORES.branco, texto: CORES.primaria },
    perigo: { fundo: '#E11D48', texto: CORES.branco },
  }[variante];

  const inativo = desabilitado || carregando;

  return (
    <Pressable
      onPress={aoTocar}
      disabled={inativo}
      style={({ pressed }) => [
        estilos.botao,
        {
          backgroundColor: cores.fundo,
          opacity: inativo ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: variante === 'secundario' ? 1 : 0,
          borderColor: CORES.borda,
        },
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={cores.texto} />
      ) : (
        <Text style={[estilos.botaoTexto, { color: cores.texto }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

export function Cartao({ children }: { children: ReactNode }) {
  return <View style={estilos.cartao}>{children}</View>;
}

const estilos = StyleSheet.create({
  etiqueta: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  etiquetaTexto: { fontSize: 12, fontWeight: '600' },
  aviso: { borderRadius: 12, padding: 14 },
  avisoTexto: { fontSize: 14, lineHeight: 20 },
  botao: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  botaoTexto: { fontSize: 16, fontWeight: '700' },
  cartao: {
    backgroundColor: CORES.branco,
    borderColor: CORES.borda,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
});
