import type { UsuarioAutenticado } from '@univc/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { entrar as entrarNaApi, sair as sairDaApi, sessao } from '../api/cliente';

interface ContextoAuth {
  usuario: UsuarioAutenticado | null;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<ContextoAuth | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(() =>
    sessao.usuario(),
  );

  const entrar = useCallback(async (email: string, senha: string) => {
    const resposta = await entrarNaApi(email, senha);
    setUsuario(resposta.usuario);
  }, []);

  const sair = useCallback(async () => {
    await sairDaApi();
    setUsuario(null);
  }, []);

  const valor = useMemo(() => ({ usuario, entrar, sair }), [usuario, entrar, sair]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useAuth precisa estar dentro de <ProvedorAuth>.');
  }
  return contexto;
}
