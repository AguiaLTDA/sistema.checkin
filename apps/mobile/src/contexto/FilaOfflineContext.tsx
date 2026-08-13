import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  enfileirar,
  lerFila,
  sincronizarFila,
} from '../lib/filaOffline';
import type { RegistroPendente } from '../tipos';
import { useAuth } from './AuthContext';

interface ContextoFila {
  pendentes: RegistroPendente[];
  online: boolean;
  sincronizando: boolean;
  /** Guarda um check-in feito sem conexao para envio posterior. */
  guardar: (
    item: Omit<RegistroPendente, 'id_local' | 'tentativas'>,
  ) => Promise<void>;
  /** Forca uma tentativa de envio; devolve quantos foram aceitos. */
  sincronizar: () => Promise<number>;
}

const Contexto = createContext<ContextoFila | null>(null);

export function ProvedorFilaOffline({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [pendentes, setPendentes] = useState<RegistroPendente[]>([]);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const emAndamento = useRef(false);

  useEffect(() => {
    void lerFila().then(setPendentes);
  }, []);

  const sincronizar = useCallback(async (): Promise<number> => {
    // Sem sessao nao ha para quem registrar; e o `emAndamento` evita que o
    // listener de rede e o botao de tentar agora rodem em paralelo.
    if (!usuario || emAndamento.current) return 0;

    emAndamento.current = true;
    setSincronizando(true);
    try {
      const resultado = await sincronizarFila();
      setPendentes(resultado.restantes);
      return resultado.enviados;
    } finally {
      emAndamento.current = false;
      setSincronizando(false);
    }
  }, [usuario]);

  // Reenvia automaticamente assim que a conexao volta.
  useEffect(() => {
    const cancelar = NetInfo.addEventListener((estado) => {
      const conectado = Boolean(estado.isConnected);
      setOnline(conectado);
      if (conectado) void sincronizar();
    });

    return cancelar;
  }, [sincronizar]);

  // E tambem ao entrar no app com sessao ativa.
  useEffect(() => {
    if (usuario) void sincronizar();
  }, [usuario, sincronizar]);

  const guardar = useCallback(
    async (item: Omit<RegistroPendente, 'id_local' | 'tentativas'>) => {
      setPendentes(await enfileirar(item));
    },
    [],
  );

  const valor = useMemo(
    () => ({ pendentes, online, sincronizando, guardar, sincronizar }),
    [pendentes, online, sincronizando, guardar, sincronizar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFilaOffline(): ContextoFila {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useFilaOffline precisa estar dentro de <ProvedorFilaOffline>.');
  }
  return contexto;
}
