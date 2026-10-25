import { useState, type FormEvent } from 'react';
import { alterarSenha, ErroRequisicao } from '../api/cliente';
import { Alerta, Botao, Campo, classesInput } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';

/**
 * Tela obrigatoria quando `usuario.deve_trocar_senha` e true: acontece logo
 * depois que o RH cadastra o usuario ou redefine a senha. Pede a senha
 * temporaria (recebida por fora do sistema) e a nova senha, escolhida por ele.
 */
export function TrocarSenha() {
  const { atualizarUsuario, sair } = useAuth('usuario');
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
      atualizarUsuario(await alterarSenha(senhaAtual, senhaNova));
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel trocar a senha. A API esta rodando?',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-univc-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <img src="/logo-univc.png" alt="UNIVC" className="h-12" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Defina sua nova senha
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Digite a senha temporaria que o RH passou para voce e escolha uma
          senha nova, so sua, para continuar.
        </p>

        <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4">
          <Campo rotulo="Senha temporaria">
            <input
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(evento) => setSenhaAtual(evento.target.value)}
              className={classesInput}
              required
              minLength={6}
            />
          </Campo>
          <Campo rotulo="Senha nova">
            <input
              type="password"
              autoComplete="new-password"
              value={senhaNova}
              onChange={(evento) => setSenhaNova(evento.target.value)}
              className={classesInput}
              required
              minLength={6}
            />
          </Campo>
          <Campo rotulo="Confirme a senha nova">
            <input
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(evento) => setConfirmacao(evento.target.value)}
              className={classesInput}
              required
              minLength={6}
            />
          </Campo>

          {erro && <Alerta>{erro}</Alerta>}

          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar nova senha'}
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => void sair()}>
            Sair
          </Botao>
        </form>
      </div>
    </div>
  );
}
