import type { UsuarioAutenticado } from '@univc/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  entrar as entrarNaApi,
  sairDaSessao,
  sessoes,
  type Escopo,
} from '../api/cliente';

interface SessaoEscopo {
  usuario: UsuarioAutenticado | null;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** Substitui os dados do usuario na tela (ex.: depois de trocar a senha). */
  atualizarUsuario: (usuario: UsuarioAutenticado) => void;
}

type ContextoAuth = Record<Escopo, SessaoEscopo>;

const Contexto = createContext<ContextoAuth | null>(null);

/** Guarda as duas sessoes (RH e usuario), cada uma com login proprio. */
export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuarios, setUsuarios] = useState<
    Record<Escopo, UsuarioAutenticado | null>
  >(() => ({
    rh: sessoes.rh.usuario(),
    usuario: sessoes.usuario.usuario(),
  }));

  const entrar = useCallback(
    async (escopo: Escopo, email: string, senha: string) => {
      const resposta = await entrarNaApi(escopo, email, senha);
      setUsuarios((atual) => ({ ...atual, [escopo]: resposta.usuario }));
    },
    [],
  );

  const sair = useCallback(async (escopo: Escopo) => {
    await sairDaSessao(escopo);
    setUsuarios((atual) => ({ ...atual, [escopo]: null }));
  }, []);

  const atualizar = useCallback((escopo: Escopo, usuario: UsuarioAutenticado) => {
    setUsuarios((atual) => ({ ...atual, [escopo]: usuario }));
  }, []);

  const valor = useMemo<ContextoAuth>(
    () => ({
      rh: {
        usuario: usuarios.rh,
        entrar: (email, senha) => entrar('rh', email, senha),
        sair: () => sair('rh'),
        atualizarUsuario: (usuario) => atualizar('rh', usuario),
      },
      usuario: {
        usuario: usuarios.usuario,
        entrar: (email, senha) => entrar('usuario', email, senha),
        sair: () => sair('usuario'),
        atualizarUsuario: (usuario) => atualizar('usuario', usuario),
      },
    }),
    [usuarios, entrar, sair, atualizar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(escopo: Escopo): SessaoEscopo {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useAuth precisa estar dentro de <ProvedorAuth>.');
  }
  return contexto[escopo];
}
