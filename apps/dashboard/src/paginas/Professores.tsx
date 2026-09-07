import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ErroRequisicao } from '../api/cliente';
import {
  apagarProfessor,
  criarProfessor,
  editarProfessor,
  listarProfessores,
  redefinirSenhaProfessor,
  type ProfessorFormulario,
  type ProfessorResumo,
} from '../api/consultas';
import { Alerta, Botao, Campo, Cartao, classesInput } from '../componentes/ui';

const FORMULARIO_VAZIO: ProfessorFormulario = {
  nome: '',
  cpf: '',
  email: '',
  curso_vinculado: '',
};

export function Professores() {
  const [professores, setProfessores] = useState<ProfessorResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [emRedefinicao, setEmRedefinicao] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{
    nome: string;
    email: string;
    senha: string;
  } | null>(null);

  const [mostrarFormularioNovo, setMostrarFormularioNovo] = useState(false);
  const [formularioNovo, setFormularioNovo] =
    useState<ProfessorFormulario>(FORMULARIO_VAZIO);
  const [criando, setCriando] = useState(false);

  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [formularioEdicao, setFormularioEdicao] =
    useState<ProfessorFormulario>(FORMULARIO_VAZIO);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [emExclusao, setEmExclusao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await listarProfessores();
      setProfessores(resposta.dados);
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Falha ao carregar os professores.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function redefinirSenha(professor: ProfessorResumo) {
    setEmRedefinicao(professor.id);
    setErro(null);
    setSenhaGerada(null);
    try {
      const { senha_temporaria: senha } = await redefinirSenhaProfessor(
        professor.id,
      );
      setSenhaGerada({ nome: professor.nome, email: professor.email, senha });
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel redefinir a senha.',
      );
    } finally {
      setEmRedefinicao(null);
    }
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setCriando(true);
    setErro(null);
    setSenhaGerada(null);
    try {
      const { professor, senha_temporaria: senha } =
        await criarProfessor(formularioNovo);
      setSenhaGerada({ nome: professor.nome, email: professor.email, senha });
      setFormularioNovo(FORMULARIO_VAZIO);
      setMostrarFormularioNovo(false);
      await carregar();
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel cadastrar o professor.',
      );
    } finally {
      setCriando(false);
    }
  }

  function iniciarEdicao(professor: ProfessorResumo) {
    setErro(null);
    setEmEdicao(professor.id);
    setFormularioEdicao({
      nome: professor.nome,
      cpf: professor.cpf,
      email: professor.email,
      curso_vinculado: professor.curso_vinculado,
    });
  }

  async function salvarEdicao(id: string) {
    setSalvandoEdicao(true);
    setErro(null);
    try {
      await editarProfessor(id, formularioEdicao);
      setEmEdicao(null);
      await carregar();
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel salvar as alteracoes.',
      );
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function alternarAtivo(professor: ProfessorResumo) {
    setErro(null);
    try {
      await editarProfessor(professor.id, { ativo: !professor.ativo });
      await carregar();
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel alterar o status do professor.',
      );
    }
  }

  async function apagar(professor: ProfessorResumo) {
    const confirmado = window.confirm(
      `Apagar definitivamente ${professor.nome}? Os registros de ponto dele tambem serao removidos. Essa acao nao pode ser desfeita.`,
    );
    if (!confirmado) return;

    setEmExclusao(professor.id);
    setErro(null);
    try {
      await apagarProfessor(professor.id);
      await carregar();
    } catch (falha) {
      setErro(
        falha instanceof ErroRequisicao
          ? falha.message
          : 'Nao foi possivel apagar o professor.',
      );
    } finally {
      setEmExclusao(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Alerta tom="info">
        Ao cadastrar um professor, uma senha temporaria de uso unico e gerada
        na hora. Repasse por fora do sistema (telefone, presencial etc.) — ela
        so aparece uma vez e nao fica gravada em lugar nenhum. No primeiro
        login, o professor e obrigado a escolher a senha definitiva.
      </Alerta>

      {erro && <Alerta>{erro}</Alerta>}

      {senhaGerada && (
        <Cartao titulo="Senha temporaria gerada">
          <p className="text-sm text-slate-600">
            Para <strong>{senhaGerada.nome}</strong> ({senhaGerada.email}):
          </p>
          <p className="mt-2 rounded-lg bg-slate-100 px-4 py-3 font-mono text-lg tracking-wide text-slate-900">
            {senhaGerada.senha}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Essa é a única vez que ela aparece. Copie e repasse agora.
          </p>
          <div className="mt-3">
            <Botao variante="secundario" onClick={() => setSenhaGerada(null)}>
              Fechar
            </Botao>
          </div>
        </Cartao>
      )}

      <Cartao
        titulo={`Professores (${professores.length})`}
        acoes={
          <Botao
            variante={mostrarFormularioNovo ? 'secundario' : 'primario'}
            onClick={() => setMostrarFormularioNovo((atual) => !atual)}
          >
            {mostrarFormularioNovo ? 'Cancelar' : 'Novo professor'}
          </Botao>
        }
      >
        {mostrarFormularioNovo && (
          <form
            onSubmit={(evento) => void criar(evento)}
            className="mb-5 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Campo rotulo="Nome completo">
              <input
                required
                className={classesInput}
                value={formularioNovo.nome}
                onChange={(evento) =>
                  setFormularioNovo((atual) => ({
                    ...atual,
                    nome: evento.target.value,
                  }))
                }
              />
            </Campo>
            <Campo rotulo="CPF (somente numeros)">
              <input
                required
                pattern="\d{11}"
                title="11 digitos numericos"
                className={classesInput}
                value={formularioNovo.cpf}
                onChange={(evento) =>
                  setFormularioNovo((atual) => ({
                    ...atual,
                    cpf: evento.target.value,
                  }))
                }
              />
            </Campo>
            <Campo rotulo="Email">
              <input
                required
                type="email"
                className={classesInput}
                value={formularioNovo.email}
                onChange={(evento) =>
                  setFormularioNovo((atual) => ({
                    ...atual,
                    email: evento.target.value,
                  }))
                }
              />
            </Campo>
            <Campo rotulo="Curso vinculado">
              <input
                required
                className={classesInput}
                value={formularioNovo.curso_vinculado}
                onChange={(evento) =>
                  setFormularioNovo((atual) => ({
                    ...atual,
                    curso_vinculado: evento.target.value,
                  }))
                }
              />
            </Campo>
            <div className="sm:col-span-2 lg:col-span-4">
              <Botao type="submit" disabled={criando}>
                {criando ? 'Cadastrando...' : 'Cadastrar professor'}
              </Botao>
            </div>
          </form>
        )}

        {carregando ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Carregando...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Professor</th>
                  <th className="px-3 py-2 font-semibold">CPF</th>
                  <th className="px-3 py-2 font-semibold">Curso</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {professores.map((professor) =>
                  emEdicao === professor.id ? (
                    <tr key={professor.id} className="align-top bg-univc-50/40">
                      <td className="px-3 py-3">
                        <input
                          className={`${classesInput} mb-1 w-full`}
                          value={formularioEdicao.nome}
                          onChange={(evento) =>
                            setFormularioEdicao((atual) => ({
                              ...atual,
                              nome: evento.target.value,
                            }))
                          }
                        />
                        <input
                          type="email"
                          className={`${classesInput} w-full`}
                          value={formularioEdicao.email}
                          onChange={(evento) =>
                            setFormularioEdicao((atual) => ({
                              ...atual,
                              email: evento.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          pattern="\d{11}"
                          title="11 digitos numericos"
                          className={`${classesInput} w-32`}
                          value={formularioEdicao.cpf}
                          onChange={(evento) =>
                            setFormularioEdicao((atual) => ({
                              ...atual,
                              cpf: evento.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className={`${classesInput} w-full`}
                          value={formularioEdicao.curso_vinculado}
                          onChange={(evento) =>
                            setFormularioEdicao((atual) => ({
                              ...atual,
                              curso_vinculado: evento.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {professor.ativo ? 'Ativo' : 'Inativo'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Botao
                            disabled={salvandoEdicao}
                            onClick={() => void salvarEdicao(professor.id)}
                          >
                            {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                          </Botao>
                          <Botao
                            variante="secundario"
                            disabled={salvandoEdicao}
                            onClick={() => setEmEdicao(null)}
                          >
                            Cancelar
                          </Botao>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={professor.id} className="align-top hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">
                          {professor.nome}
                        </p>
                        <p className="text-xs text-slate-500">
                          {professor.email}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {professor.cpf}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {professor.curso_vinculado}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {professor.ativo ? 'Ativo' : 'Inativo'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Botao
                            variante="secundario"
                            onClick={() => iniciarEdicao(professor)}
                          >
                            Editar
                          </Botao>
                          <Botao
                            variante="secundario"
                            onClick={() => void alternarAtivo(professor)}
                          >
                            {professor.ativo ? 'Desativar' : 'Ativar'}
                          </Botao>
                          <Botao
                            variante="secundario"
                            disabled={emRedefinicao === professor.id}
                            onClick={() => void redefinirSenha(professor)}
                          >
                            {emRedefinicao === professor.id
                              ? 'Gerando...'
                              : 'Redefinir senha'}
                          </Botao>
                          <Botao
                            variante="perigo"
                            disabled={emExclusao === professor.id}
                            onClick={() => void apagar(professor)}
                          >
                            {emExclusao === professor.id
                              ? 'Apagando...'
                              : 'Apagar'}
                          </Botao>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
