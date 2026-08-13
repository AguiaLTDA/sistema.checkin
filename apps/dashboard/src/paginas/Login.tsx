import { useState, type FormEvent } from 'react';
import { ErroRequisicao } from '../api/cliente';
import { Alerta, Botao, Campo, classesInput } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';

export function Login() {
  const { entrar } = useAuth();
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
        <h1 className="text-xl font-semibold text-slate-900">UNIVC Check-in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Acesso do RH e da coordenacao ao controle de presenca docente.
        </p>

        <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4">
          <Campo rotulo="Email">
            <input
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className={classesInput}
              placeholder="rh@univc.br"
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

        <p className="mt-6 text-xs text-slate-400">
          Este painel e exclusivo de administradores. Professores registram
          ponto pelo aplicativo no celular.
        </p>
      </div>
    </div>
  );
}
