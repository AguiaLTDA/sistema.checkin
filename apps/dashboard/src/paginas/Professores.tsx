import { useCallback, useEffect, useState } from 'react';
import { ErroRequisicao } from '../api/cliente';
import {
  listarProfessores,
  redefinirSenhaProfessor,
  type ProfessorResumo,
} from '../api/consultas';
import { Alerta, Botao, Cartao } from '../componentes/ui';

export function Professores() {
  const [professores, setProfessores] = useState<ProfessorResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [emRedefinicao, setEmRedefinicao] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{
    professor: ProfessorResumo;
    senha: string;
  } | null>(null);

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
      setSenhaGerada({ professor, senha });
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

  return (
    <div className="flex flex-col gap-6">
      <Alerta tom="info">
        Redefinir gera uma senha temporaria de uso unico. Repasse ao professor
        por fora do sistema (telefone, presencial etc.) — ela só aparece
        aqui, uma vez, e não fica gravada em lugar nenhum. No primeiro login
        com ela, o professor é obrigado a escolher a senha definitiva antes
        de continuar.
      </Alerta>

      {erro && <Alerta>{erro}</Alerta>}

      {senhaGerada && (
        <Cartao titulo="Senha temporaria gerada">
          <p className="text-sm text-slate-600">
            Para <strong>{senhaGerada.professor.nome}</strong> (
            {senhaGerada.professor.email}):
          </p>
          <p className="mt-2 rounded-lg bg-slate-100 px-4 py-3 font-mono text-lg tracking-wide text-slate-900">
            {senhaGerada.senha}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Essa é a única vez que ela aparece. Copie e repasse agora.
          </p>
          <div className="mt-3">
            <Botao
              variante="secundario"
              onClick={() => setSenhaGerada(null)}
            >
              Fechar
            </Botao>
          </div>
        </Cartao>
      )}

      <Cartao titulo={`Professores (${professores.length})`}>
        {carregando ? (
          <p className="py-8 text-center text-sm text-slate-500">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Professor</th>
                  <th className="px-3 py-2 font-semibold">Curso</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {professores.map((professor) => (
                  <tr key={professor.id} className="align-top hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{professor.nome}</p>
                      <p className="text-xs text-slate-500">{professor.email}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {professor.curso_vinculado}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {professor.ativo ? 'Ativo' : 'Inativo'}
                    </td>
                    <td className="px-3 py-3">
                      <Botao
                        variante="secundario"
                        disabled={emRedefinicao === professor.id}
                        onClick={() => void redefinirSenha(professor)}
                      >
                        {emRedefinicao === professor.id
                          ? 'Gerando...'
                          : 'Redefinir senha'}
                      </Botao>
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
