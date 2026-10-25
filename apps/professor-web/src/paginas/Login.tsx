import { useState, type FormEvent } from 'react';
import { ErroApi, ErroDeRede } from '../api/cliente';
import { Aviso, Botao } from '../componentes/ui';
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
      if (falha instanceof ErroDeRede) {
        setErro('Nao consegui falar com o servidor. Confira sua conexao.');
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
    <div className="flex min-h-full items-center justify-center bg-univc-900 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <img src="/logo-univc.png" alt="UNIVC" className="h-11" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          Check-in do professor
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Registre sua chegada e saida pelo celular ou computador.
        </p>

        <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Email institucional</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-univc-500 focus:ring-2 focus:ring-univc-500/30"
              placeholder="professor@univc.br"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-univc-500 focus:ring-2 focus:ring-univc-500/30"
              required
              minLength={6}
            />
          </label>

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <Botao type="submit" carregando={enviando}>
            Entrar
          </Botao>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          O registro usa apenas a sua localizacao no momento em que voce toca
          no botao, para confirmar que voce esta no campus. Nenhum dado
          biometrico e lido ou enviado.
        </p>
      </div>
    </div>
  );
}
