import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ErroApi, ErroDeRede, URL_API } from '../api/cliente';
import { Aviso, Botao } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';
import { CORES } from '../lib/formato';

export function LoginTela() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEntrar() {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (falha) {
      if (falha instanceof ErroDeRede) {
        setErro(
          `Nao consegui falar com o servidor (${URL_API}). Confira se a API esta no ar e se o celular esta na mesma rede.`,
        );
      } else if (falha instanceof ErroApi) {
        setErro(falha.message);
      } else {
        setErro('Falha inesperada ao entrar.');
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
          <Image
            source={require('../../assets/logo-univc-branco.png')}
            style={estilos.logo}
            resizeMode="contain"
          />
          <Text style={estilos.subtitulo}>
            Registro de ponto docente do Centro Universitario Vale do Cricare
          </Text>
        </View>

        <View style={estilos.formulario}>
          <Text style={estilos.rotulo}>Email institucional</Text>
          <TextInput
            style={estilos.input}
            value={email}
            onChangeText={setEmail}
            placeholder="professor@univc.br"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
          />

          <Text style={estilos.rotulo}>Senha</Text>
          <TextInput
            style={estilos.input}
            value={senha}
            onChangeText={setSenha}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            textContentType="password"
          />

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <Botao
            titulo="Entrar"
            aoTocar={() => void aoEntrar()}
            carregando={enviando}
            desabilitado={email.trim().length === 0 || senha.length < 6}
          />
        </View>

        <Text style={estilos.rodape}>
          O registro de ponto e confirmado apenas pela sua localizacao no
          momento em que voce marca chegada ou saida. Nenhum dado biometrico e
          lido ou enviado pelo app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { backgroundColor: CORES.primariaEscura, flex: 1 },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28 },
  cabecalho: { gap: 8 },
  logo: { height: 40, width: 180 },
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
  rodape: { color: '#94A3B8', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
