import { useState, type FormEvent } from 'react';
import { alterarSenha, ErroApi, ErroDeRede } from '../api/cliente';
import { Aviso, Botao } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';

/**
 * Tela obrigatoria quando `usuario.deve_trocar_senha` e true — acontece logo
 * depois que o RH redefine a senha do professor. Pede a senha temporaria (que
 * o professor recebeu por fora do sistema) e a nova senha, escolhida por ele.
 */
export function TrocarSenha() {
  const { atualizarUsuario, sair } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
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
    <div className="flex min-h-full items-center justify-center bg-univc-900 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-lg font-semibold text-slate-900">
          Defina sua nova senha
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          O RH redefiniu sua senha. Digite a senha temporaria que voce recebeu
          e escolha uma senha nova, so sua, para continuar.
        </p>

        <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Senha temporaria</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(evento) => setSenhaAtual(evento.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-univc-500 focus:ring-2 focus:ring-univc-500/30"
              required
              minLength={6}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Senha nova</span>
            <input
              type="password"
              autoComplete="new-password"
              value={senhaNova}
              onChange={(evento) => setSenhaNova(evento.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-univc-500 focus:ring-2 focus:ring-univc-500/30"
              required
              minLength={6}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Confirme a senha nova</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(evento) => setConfirmacao(evento.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-univc-500 focus:ring-2 focus:ring-univc-500/30"
              required
              minLength={6}
            />
          </label>

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <Botao type="submit" carregando={enviando}>
            Salvar nova senha
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => void sair()}>
            Sair
          </Botao>
        </form>
      </div>
    </div>
  );
}
