import type { PerfilDTO } from '@univc/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ErroRequisicao } from '../api/cliente';
import { atualizarPerfil, criarPerfil, listarPerfis } from '../api/consultas';
import { Alerta, Botao, Campo, Cartao, Vazio, classesInput } from '../componentes/ui';

/**
 * Perfis que classificam os usuarios (Professor, Estagiario, Estudante...).
 * O RH cria, renomeia e desativa; desativar so tira o perfil dos formularios.
 */
export function Perfis() {
  const [perfis, setPerfis] = useState<PerfilDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [descricaoEdicao, setDescricaoEdicao] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPerfis((await listarPerfis()).dados);
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao ? falha.message : 'Falha ao carregar os perfis.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      setAviso(sucesso);
      await carregar();
      return true;
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao ? falha.message : 'Nao foi possivel salvar o perfil.',
      );
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function aoCriar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await executar(
      () => criarPerfil({ nome: nome.trim(), descricao: descricao.trim() || undefined }),
      `Perfil "${nome.trim()}" criado.`,
    );
    if (ok) {
      setNome('');
      setDescricao('');
    }
  }

  async function aoSalvarEdicao(perfil: PerfilDTO) {
    const ok = await executar(
      () =>
        atualizarPerfil(perfil.id, {
          nome: nomeEdicao.trim(),
          descricao: descricaoEdicao.trim() || null,
        }),
      `Perfil "${nomeEdicao.trim()}" salvo.`,
    );
    if (ok) setEmEdicao(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Alerta tom="info">
        Perfis classificam quem bate ponto: professores, estagiarios, estudantes
        ou qualquer outro vinculo. Renomear um perfil atualiza todos os usuarios
        que o usam; desativar apenas o esconde do cadastro de novos usuarios.
      </Alerta>
      {aviso && <Alerta tom="info">{aviso}</Alerta>}
      {erro && <Alerta>{erro}</Alerta>}

      <Cartao titulo="Novo perfil">
        <form onSubmit={aoCriar} className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Nome">
            <input
              className={classesInput}
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Monitor, Tecnico, Residente"
              required
              minLength={2}
              maxLength={60}
            />
          </Campo>
          <div className="min-w-64 flex-1">
            <Campo rotulo="Descricao (opcional)">
              <input
                className={classesInput}
                value={descricao}
                onChange={(evento) => setDescricao(evento.target.value)}
                maxLength={200}
              />
            </Campo>
          </div>
          <Botao type="submit" disabled={salvando}>
            Criar perfil
          </Botao>
        </form>
      </Cartao>

      <Cartao titulo={`Perfis (${perfis.length})`}>
        {carregando && perfis.length === 0 ? (
          <Vazio>Carregando...</Vazio>
        ) : perfis.length === 0 ? (
          <Vazio>Nenhum perfil cadastrado.</Vazio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {perfis.map((perfil) => (
              <li
                key={perfil.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                {emEdicao === perfil.id ? (
                  <div className="flex flex-1 flex-wrap items-end gap-3">
                    <Campo rotulo="Nome">
                      <input
                        className={classesInput}
                        value={nomeEdicao}
                        onChange={(evento) => setNomeEdicao(evento.target.value)}
                        minLength={2}
                        maxLength={60}
                      />
                    </Campo>
                    <div className="min-w-64 flex-1">
                      <Campo rotulo="Descricao">
                        <input
                          className={classesInput}
                          value={descricaoEdicao}
                          onChange={(evento) => setDescricaoEdicao(evento.target.value)}
                          maxLength={200}
                        />
                      </Campo>
                    </div>
                    <Botao
                      disabled={salvando || nomeEdicao.trim().length < 2}
                      onClick={() => void aoSalvarEdicao(perfil)}
                    >
                      Salvar
                    </Botao>
                    <Botao variante="secundario" onClick={() => setEmEdicao(null)}>
                      Cancelar
                    </Botao>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium text-slate-800">
                        {perfil.nome}
                        {!perfil.ativo && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            desativado
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {perfil.descricao ?? 'Sem descricao'} ·{' '}
                        {perfil.total_usuarios} usuario(s)
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Botao
                        variante="secundario"
                        onClick={() => {
                          setEmEdicao(perfil.id);
                          setNomeEdicao(perfil.nome);
                          setDescricaoEdicao(perfil.descricao ?? '');
                        }}
                      >
                        Renomear
                      </Botao>
                      <Botao
                        variante={perfil.ativo ? 'perigo' : 'secundario'}
                        disabled={salvando}
                        onClick={() =>
                          void executar(
                            () => atualizarPerfil(perfil.id, { ativo: !perfil.ativo }),
                            `Perfil "${perfil.nome}" ${perfil.ativo ? 'desativado' : 'reativado'}.`,
                          )
                        }
                      >
                        {perfil.ativo ? 'Desativar' : 'Reativar'}
                      </Botao>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
