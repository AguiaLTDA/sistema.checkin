import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { alterarSenha, ErroApi, ErroDeRede } from '../api/cliente';
import { Aviso, Botao } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';
import { CORES } from '../lib/formato';

/**
 * Tela obrigatoria quando `usuario.deve_trocar_senha` e true — acontece logo
 * depois que o RH redefine a senha do professor. Pede a senha temporaria (que
 * o professor recebeu por fora do sistema) e a nova senha, escolhida por ele.
 */
export function TrocarSenhaTela() {
  const { atualizarUsuario, sair } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoSalvar() {
    setErro(null);

    if (senhaNova !== confirmacao) {
      setErro('A confirmacao nao bate com a senha nova.');
      return;
    }

    setEnviando(true);
    try {
      const usuario = await alterarSenha(senhaAtual, senhaNova);
      atualizarUsuario(usuario);
    } catch (falha) {
      if (falha instanceof ErroDeRede) {
        setErro('Nao consegui falar com o servidor. Confira sua conexao.');
      } else if (falha instanceof ErroApi) {
        setErro(falha.message);
      } else {
        setErro('Falha inesperada ao trocar a senha.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <View style={estilos.cabecalho}>
          <Text style={estilos.titulo}>Defina sua nova senha</Text>
          <Text style={estilos.subtitulo}>
            O RH redefiniu sua senha. Digite a senha temporaria que voce
            recebeu e escolha uma senha nova, so sua, para continuar.
          </Text>
        </View>

        <View style={estilos.formulario}>
          <Text style={estilos.rotulo}>Senha temporaria</Text>
          <TextInput
            style={estilos.input}
            value={senhaAtual}
            onChangeText={setSenhaAtual}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            textContentType="password"
          />

          <Text style={estilos.rotulo}>Senha nova</Text>
          <TextInput
            style={estilos.input}
            value={senhaNova}
            onChangeText={setSenhaNova}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            textContentType="newPassword"
          />

          <Text style={estilos.rotulo}>Confirme a senha nova</Text>
          <TextInput
            style={estilos.input}
            value={confirmacao}
            onChangeText={setConfirmacao}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            textContentType="newPassword"
          />

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <Botao
            titulo="Salvar nova senha"
            aoTocar={() => void aoSalvar()}
            carregando={enviando}
            desabilitado={
              senhaAtual.length < 6 || senhaNova.length < 6 || confirmacao.length < 6
            }
          />
          <Botao titulo="Sair" variante="secundario" aoTocar={() => void sair()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { backgroundColor: CORES.primariaEscura, flex: 1 },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28 },
  cabecalho: { gap: 8 },
  titulo: { color: CORES.branco, fontSize: 26, fontWeight: '800' },
  subtitulo: { color: '#CBD5E1', fontSize: 15, lineHeight: 21 },
  formulario: {
    backgroundColor: CORES.branco,
    borderRadius: 20,
    gap: 10,
    padding: 20,
  },
  rotulo: { color: CORES.textoFraco, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: CORES.borda,
    borderRadius: 12,
    borderWidth: 1,
    color: CORES.texto,
    fontSize: 16,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
