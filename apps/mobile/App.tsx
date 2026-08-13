import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorAuth, useAuth } from './src/contexto/AuthContext';
import { ProvedorFilaOffline } from './src/contexto/FilaOfflineContext';
import { CORES } from './src/lib/formato';
import { HistoricoTela } from './src/telas/HistoricoTela';
import { LoginTela } from './src/telas/LoginTela';
import { PrincipalTela } from './src/telas/PrincipalTela';

type Rotas = {
  Principal: undefined;
  Historico: undefined;
};

const Pilha = createNativeStackNavigator<Rotas>();

function Navegacao() {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  if (!usuario) return <LoginTela />;

  return (
    <NavigationContainer>
      <Pilha.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: CORES.primariaEscura },
          headerTintColor: CORES.branco,
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Pilha.Screen name="Principal" options={{ title: 'Registro de ponto' }}>
          {({ navigation }) => (
            <PrincipalTela
              irParaHistorico={() => navigation.navigate('Historico')}
            />
          )}
        </Pilha.Screen>
        <Pilha.Screen
          name="Historico"
          component={HistoricoTela}
          options={{ title: 'Meu historico' }}
        />
      </Pilha.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProvedorAuth>
        <ProvedorFilaOffline>
          <StatusBar style="light" />
          <Navegacao />
        </ProvedorFilaOffline>
      </ProvedorAuth>
    </SafeAreaProvider>
  );
}
