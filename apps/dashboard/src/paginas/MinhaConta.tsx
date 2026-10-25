import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { alterarSenhaRh, atualizarContaRh, ErroRequisicao } from '../api/cliente';
import { Alerta, Botao, Campo, Cartao, classesInput } from '../componentes/ui';
import { useAuth } from '../contexto/AuthContext';

function mensagemDeErro(falha: unknown, padrao: string): string {
  return falha instanceof ErroRequisicao ? falha.message : padrao;
}

/** Dados do proprio RH logado: nome, email e senha. */
export function MinhaConta() {
  const { usuario, atualizarUsuario, sair } = useAuth('rh');
  const navegar = useNavigate();

  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [trocando, setTrocando] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const alterado = nome.trim() !== usuario?.nome || email.trim() !== usuario?.email;

  async function salvarDados(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    setErro(null);
    setSalvando(true);
    try {
      const atualizado = await atualizarContaRh({
        ...(nome.trim() !== usuario?.nome ? { nome: nome.trim() } : {}),
        ...(email.trim() !== usuario?.email ? { email: email.trim() } : {}),
      });
      atualizarUsuario(atualizado);
      setNome(atualizado.nome);
      setEmail(atualizado.email);
      setAviso(
        atualizado.email !== usuario?.email
          ? `Dados salvos. O seu login agora e ${atualizado.email}.`
          : 'Dados salvos.',
      );
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Nao foi possivel salvar os dados.'));
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(evento: FormEvent) {
    evento.preventDefault();
    setErroSenha(null);
    if (senhaNova !== confirmacao) {
      setErroSenha('A confirmacao nao bate com a senha nova.');
      return;
    }
    setTrocando(true);
    try {
      await alterarSenhaRh(senhaAtual, senhaNova);
      // A API derruba todas as sessoes do RH: saimos e pedimos o login de novo.
      await sair();
      // Trocar a rota evita cair de volta nesta tela depois de entrar.
      navegar('/rh/registros', { replace: true });
    } catch (falha) {
      setErroSenha(mensagemDeErro(falha, 'Nao foi possivel trocar a senha.'));
      setTrocando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Cartao titulo="Meus dados">
        <form onSubmit={salvarDados} className="flex flex-col gap-4">
          <Campo rotulo="Nome completo">
            <input
              className={classesInput}
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              required
              minLength={3}
              maxLength={160}
            />
          </Campo>
          <Campo rotulo="Email (login)">
            <input
              type="email"
              className={classesInput}
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              required
              maxLength={160}
            />
          </Campo>

          {aviso && <Alerta tom="info">{aviso}</Alerta>}
          {erro && <Alerta>{erro}</Alerta>}

          <div>
            <Botao type="submit" disabled={salvando || !alterado}>
              {salvando ? 'Salvando...' : 'Salvar dados'}
            </Botao>
          </div>
        </form>
      </Cartao>

      <Cartao titulo="Trocar senha">
        <form onSubmit={trocarSenha} className="flex flex-col gap-4">
          <Campo rotulo="Senha atual">
            <input
              type="password"
              autoComplete="current-password"
              className={classesInput}
              value={senhaAtual}
              onChange={(evento) => setSenhaAtual(evento.target.value)}
              required
              minLength={6}
            />
          </Campo>
          <Campo rotulo="Senha nova">
            <input
              type="password"
              autoComplete="new-password"
              className={classesInput}
              value={senhaNova}
              onChange={(evento) => setSenhaNova(evento.target.value)}
              required
              minLength={6}
            />
          </Campo>
          <Campo rotulo="Confirme a senha nova">
            <input
              type="password"
              autoComplete="new-password"
              className={classesInput}
              value={confirmacao}
              onChange={(evento) => setConfirmacao(evento.target.value)}
              required
              minLength={6}
            />
          </Campo>

          <Alerta tom="aviso">
            Ao trocar a senha, todas as sessoes abertas do RH sao encerradas e
            voce precisa entrar de novo com a senha nova.
          </Alerta>
          {erroSenha && <Alerta>{erroSenha}</Alerta>}

          <div>
            <Botao type="submit" disabled={trocando}>
              {trocando ? 'Trocando...' : 'Trocar senha'}
            </Botao>
          </div>
        </form>
      </Cartao>
    </div>
  );
}
