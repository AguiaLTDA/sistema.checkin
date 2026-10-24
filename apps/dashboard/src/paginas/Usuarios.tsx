import type { PerfilDTO, UsuarioDTO } from '@univc/shared';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ErroRequisicao } from '../api/cliente';
import {
  atualizarUsuario,
  criarUsuario,
  listarPerfis,
  listarUsuarios,
} from '../api/consultas';
import { Alerta, Botao, Campo, Cartao, Vazio, classesInput } from '../componentes/ui';
import { CURSOS_UNIVC } from '../lib/cursos';
import { formatarCpf } from '../lib/formato';

interface Formulario {
  nome: string;
  cpf: string;
  email: string;
  senha: string;
  curso_vinculado: string;
  perfil_id: string;
}

const FORMULARIO_VAZIO: Formulario = {
  nome: '',
  cpf: '',
  email: '',
  senha: '',
  curso_vinculado: '',
  perfil_id: '',
};

function mensagemDeErro(falha: unknown, padrao: string): string {
  if (!(falha instanceof ErroRequisicao)) return padrao;
  const detalhes = Array.isArray(falha.detalhes)
    ? (falha.detalhes as Array<{ campo?: string; mensagem?: string }>)
        .map((item) => item.mensagem)
        .filter(Boolean)
    : [];
  return detalhes.length > 0 ? `${falha.message} ${detalhes.join('; ')}.` : falha.message;
}

/** Cadastro de usuarios pelo RH: criar, editar, desativar e trocar senha. */
export function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioDTO[]>([]);
  const [perfis, setPerfis] = useState<PerfilDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState('');

  /** null = formulario fechado; 'novo' = criando; UsuarioDTO = editando. */
  const [emEdicao, setEmEdicao] = useState<UsuarioDTO | 'novo' | null>(null);
  const [formulario, setFormulario] = useState<Formulario>({ ...FORMULARIO_VAZIO });
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [respostaUsuarios, respostaPerfis] = await Promise.all([
        listarUsuarios(),
        listarPerfis(),
      ]);
      setUsuarios(respostaUsuarios.dados);
      setPerfis(respostaPerfis.dados);
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Falha ao carregar os usuarios.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const perfisAtivos = perfis.filter((perfil) => perfil.ativo);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((usuario) => {
      if (filtroPerfil && usuario.perfil?.id !== filtroPerfil) return false;
      if (!termo) return true;
      return [usuario.nome, usuario.email, usuario.cpf, usuario.curso_vinculado]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  }, [usuarios, busca, filtroPerfil]);

  function abrirNovo() {
    setAviso(null);
    setErroFormulario(null);
    setFormulario({ ...FORMULARIO_VAZIO, perfil_id: perfisAtivos[0]?.id ?? '' });
    setEmEdicao('novo');
  }

  function abrirEdicao(usuario: UsuarioDTO) {
    setAviso(null);
    setErroFormulario(null);
    setFormulario({
      nome: usuario.nome,
      cpf: formatarCpf(usuario.cpf),
      email: usuario.email,
      senha: '',
      curso_vinculado: usuario.curso_vinculado,
      perfil_id: usuario.perfil?.id ?? '',
    });
    setEmEdicao(usuario);
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!emEdicao) return;
    setSalvando(true);
    setErroFormulario(null);
    try {
      if (emEdicao === 'novo') {
        const { usuario } = await criarUsuario(formulario);
        setAviso(
          `Usuario ${usuario.nome} criado. Ele ja pode entrar no Painel do Usuario com ${usuario.email} e a senha cadastrada.`,
        );
      } else {
        const { usuario } = await atualizarUsuario(emEdicao.id, {
          nome: formulario.nome,
          email: formulario.email,
          curso_vinculado: formulario.curso_vinculado,
          ...(formulario.perfil_id ? { perfil_id: formulario.perfil_id } : {}),
          ...(formulario.senha ? { senha: formulario.senha } : {}),
        });
        setAviso(
          formulario.senha
            ? `Dados de ${usuario.nome} salvos e senha redefinida.`
            : `Dados de ${usuario.nome} salvos.`,
        );
      }
      setEmEdicao(null);
      await carregar();
    } catch (falha) {
      setErroFormulario(mensagemDeErro(falha, 'Nao foi possivel salvar o usuario.'));
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(usuario: UsuarioDTO) {
    if (
      usuario.ativo &&
      !window.confirm(
        `Desativar ${usuario.nome}? O acesso e bloqueado na hora, mas o historico de registros e mantido.`,
      )
    ) {
      return;
    }
    setErro(null);
    try {
      await atualizarUsuario(usuario.id, { ativo: !usuario.ativo });
      setAviso(`${usuario.nome} ${usuario.ativo ? 'desativado' : 'reativado'}.`);
      await carregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Nao foi possivel alterar o usuario.'));
    }
  }

  const atualizarCampo = (campo: keyof Formulario, valor: string) =>
    setFormulario((atual) => ({ ...atual, [campo]: valor }));

  const editando = emEdicao !== null && emEdicao !== 'novo';
  const perfisDoFormulario = perfis.filter(
    (perfil) => perfil.ativo || perfil.id === formulario.perfil_id,
  );

  return (
    <div className="flex flex-col gap-6">
      {aviso && <Alerta tom="info">{aviso}</Alerta>}
      {erro && <Alerta>{erro}</Alerta>}

      {emEdicao && (
        <Cartao titulo={editando ? `Editar ${emEdicao.nome}` : 'Novo usuario'}>
          <form onSubmit={salvar} className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Nome completo">
              <input
                className={classesInput}
                value={formulario.nome}
                onChange={(evento) => atualizarCampo('nome', evento.target.value)}
                required
                minLength={3}
              />
            </Campo>

            <Campo rotulo="Perfil">
              <select
                className={classesInput}
                value={formulario.perfil_id}
                onChange={(evento) => atualizarCampo('perfil_id', evento.target.value)}
                required
              >
                <option value="" disabled>
                  Selecione
                </option>
                {perfisDoFormulario.map((perfil) => (
                  <option key={perfil.id} value={perfil.id}>
                    {perfil.nome}
                    {perfil.ativo ? '' : ' (desativado)'}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Email (login)">
              <input
                type="email"
                className={classesInput}
                value={formulario.email}
                onChange={(evento) => atualizarCampo('email', evento.target.value)}
                placeholder="nome@univc.br"
                required
              />
            </Campo>

            <Campo rotulo={editando ? 'CPF (nao pode ser alterado)' : 'CPF'}>
              <input
                className={classesInput}
                value={formulario.cpf}
                onChange={(evento) => atualizarCampo('cpf', evento.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                disabled={editando}
                required={!editando}
              />
            </Campo>

            <Campo rotulo="Curso ou setor">
              <input
                className={classesInput}
                value={formulario.curso_vinculado}
                onChange={(evento) =>
                  atualizarCampo('curso_vinculado', evento.target.value)
                }
                list="cursos-univc"
                placeholder="Escolha ou digite"
                required
              />
              <datalist id="cursos-univc">
                {CURSOS_UNIVC.map((curso) => (
                  <option key={curso} value={curso} />
                ))}
              </datalist>
            </Campo>

            <Campo
              rotulo={
                editando ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'
              }
            >
              <input
                type="password"
                className={classesInput}
                value={formulario.senha}
                onChange={(evento) => atualizarCampo('senha', evento.target.value)}
                autoComplete="new-password"
                minLength={6}
                required={!editando}
              />
            </Campo>

            {erroFormulario && (
              <div className="md:col-span-2">
                <Alerta>{erroFormulario}</Alerta>
              </div>
            )}

            <div className="flex gap-2 md:col-span-2">
              <Botao type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando...'
                  : editando
                    ? 'Salvar alteracoes'
                    : 'Criar usuario'}
              </Botao>
              <Botao
                type="button"
                variante="secundario"
                onClick={() => setEmEdicao(null)}
              >
                Cancelar
              </Botao>
            </div>
          </form>
        </Cartao>
      )}

      <Cartao
        titulo={`Usuarios (${visiveis.length})`}
        acoes={
          <Botao onClick={abrirNovo} disabled={perfisAtivos.length === 0}>
            + Novo usuario
          </Botao>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <Campo rotulo="Buscar">
            <input
              className={classesInput}
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Nome, email, CPF ou curso"
            />
          </Campo>
          <Campo rotulo="Perfil">
            <select
              className={classesInput}
              value={filtroPerfil}
              onChange={(evento) => setFiltroPerfil(evento.target.value)}
            >
              <option value="">Todos</option>
              {perfis.map((perfil) => (
                <option key={perfil.id} value={perfil.id}>
                  {perfil.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {carregando && usuarios.length === 0 ? (
          <Vazio>Carregando...</Vazio>
        ) : visiveis.length === 0 ? (
          <Vazio>Nenhum usuario encontrado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Usuario</th>
                  <th className="px-3 py-2 font-semibold">Perfil</th>
                  <th className="px-3 py-2 font-semibold">Curso / setor</th>
                  <th className="px-3 py-2 font-semibold">CPF</th>
                  <th className="px-3 py-2 font-semibold">Situacao</th>
                  <th className="px-3 py-2 font-semibold">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.map((usuario) => (
                  <tr key={usuario.id} className="align-top hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{usuario.nome}</p>
                      <p className="text-xs text-slate-500">{usuario.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-univc-100 px-2.5 py-0.5 text-xs font-medium text-univc-900">
                        {usuario.perfil?.nome ?? 'Sem perfil'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {usuario.curso_vinculado}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">
                      {formatarCpf(usuario.cpf)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          usuario.ativo
                            ? 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'
                            : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                        }`}
                      >
                        {usuario.ativo ? 'Ativo' : 'Desativado'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Botao variante="secundario" onClick={() => abrirEdicao(usuario)}>
                          Editar
                        </Botao>
                        <Botao
                          variante={usuario.ativo ? 'perigo' : 'secundario'}
                          onClick={() => void alternarAtivo(usuario)}
                        >
                          {usuario.ativo ? 'Desativar' : 'Reativar'}
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
