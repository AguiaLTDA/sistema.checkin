import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErroRequisicao, type Escopo } from '../api/cliente';
import { Alerta, Botao, Campo, classesInput } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';

const TEXTOS: Record<
  Escopo,
  {
    titulo: string;
    descricao: string;
    exemploEmail: string;
    rodape: string;
    outraArea: { para: string; rotulo: string };
  }
> = {
  rh: {
    titulo: 'Painel do RH',
    descricao: 'Acesso do RH e da coordenacao ao controle de presenca.',
    exemploEmail: 'rh@univc.br',
    rodape:
      'Area exclusiva de administradores. Professores, estagiarios e estudantes entram pelo Painel do Usuario.',
    outraArea: { para: '/usuario', rotulo: 'Ir para o Painel do Usuario' },
  },
  usuario: {
    titulo: 'Painel do Usuario',
    descricao:
      'Professores, estagiarios e estudantes: registre chegada e saida e acompanhe seu historico.',
    exemploEmail: 'seu.nome@univc.br',
    rodape: 'Seu acesso e criado pelo RH. Esqueceu a senha? Procure o RH para redefini-la.',
    outraArea: { para: '/rh', rotulo: 'Ir para o Painel do RH' },
  },
};

export function Login({ escopo }: { escopo: Escopo }) {
  const { entrar } = useAuth(escopo);
  const textos = TEXTOS[escopo];
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel falar com a API. Ela esta rodando?',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-univc-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <Link
          to="/"
          className="text-xs font-medium text-univc-700 hover:text-univc-900"
        >
          ← Inicio
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-univc-500">
          UNIVC Check-in
        </p>
        <h1 className="text-xl font-semibold text-slate-900">{textos.titulo}</h1>
        <p className="mt-1 text-sm text-slate-500">{textos.descricao}</p>

        <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4">
          <Campo rotulo="Email">
            <input
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className={classesInput}
              placeholder={textos.exemploEmail}
              autoComplete="username"
              required
            />
          </Campo>

          <Campo rotulo="Senha">
            <input
              type="password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              className={classesInput}
              autoComplete="current-password"
              required
              minLength={6}
            />
          </Campo>

          {erro && <Alerta>{erro}</Alerta>}

          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </Botao>
        </form>

        <p className="mt-6 text-xs text-slate-400">{textos.rodape}</p>
        <Link
          to={textos.outraArea.para}
          className="mt-3 inline-block text-sm font-medium text-univc-700 hover:text-univc-900"
        >
          {textos.outraArea.rotulo} →
        </Link>
      </div>
    </div>
  );
}
