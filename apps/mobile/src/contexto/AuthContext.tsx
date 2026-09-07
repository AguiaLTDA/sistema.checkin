import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  armazenamentoSessao,
  entrar as entrarNaApi,
  sair as sairDaApi,
} from '../api/cliente';
import type { UsuarioAutenticado } from '../tipos';

interface ContextoAuth {
  usuario: UsuarioAutenticado | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** Atualiza o usuario em memoria (ex.: depois de trocar a senha). */
  atualizarUsuario: (usuario: UsuarioAutenticado) => void;
}

const Contexto = createContext<ContextoAuth | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Restaura a sessao guardada no aparelho ao abrir o app.
  useEffect(() => {
    void armazenamentoSessao
      .usuario()
      .then(setUsuario)
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const resposta = await entrarNaApi(email, senha);
    setUsuario(resposta.usuario);
  }, []);

  const sair = useCallback(async () => {
    await sairDaApi();
    setUsuario(null);
  }, []);

  const atualizarUsuario = useCallback((novo: UsuarioAutenticado) => {
    setUsuario(novo);
  }, []);

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, atualizarUsuario }),
    [usuario, carregando, entrar, sair, atualizarUsuario],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useAuth precisa estar dentro de <ProvedorAuth>.');
  return contexto;
}
