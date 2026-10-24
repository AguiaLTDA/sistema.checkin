import { STATUS_REGISTRO, TIPOS_REGISTRO } from '@univc/shared';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '@univc/shared';
import { useEffect, useState } from 'react';
import type { PerfilDTO } from '@univc/shared';
import { listarCursos, listarPerfis, listarProfessores } from '../api/consultas';
import type { ProfessorResumo } from '../api/consultas';
import { Botao, Campo, classesInput } from './ui';

export interface ValoresFiltro {
  perfil_id: string;
  curso: string;
  professor_id: string;
  status: string;
  tipo: string;
  data_inicio: string;
  data_fim: string;
}

export const FILTRO_VAZIO: ValoresFiltro = {
  perfil_id: '',
  curso: '',
  professor_id: '',
  status: '',
  tipo: '',
  data_inicio: '',
  data_fim: '',
};

/** Carrega usuarios, cursos e perfis uma vez, para popular os selects de filtro. */
export function useDadosDeFiltro() {
  const [professores, setProfessores] = useState<ProfessorResumo[]>([]);
  const [cursos, setCursos] = useState<string[]>([]);
  const [perfis, setPerfis] = useState<PerfilDTO[]>([]);

  useEffect(() => {
    void listarProfessores()
      .then((resposta) => setProfessores(resposta.dados))
      .catch(() => setProfessores([]));
    void listarCursos()
      .then((resposta) => setCursos(resposta.dados))
      .catch(() => setCursos([]));
    void listarPerfis()
      .then((resposta) => setPerfis(resposta.dados))
      .catch(() => setPerfis([]));
  }, []);

  return { professores, cursos, perfis };
}

interface Props {
  valores: ValoresFiltro;
  aoMudar: (valores: ValoresFiltro) => void;
  camposOcultos?: Array<keyof ValoresFiltro>;
}

export function FiltrosRegistros({ valores, aoMudar, camposOcultos = [] }: Props) {
  const { professores, cursos, perfis } = useDadosDeFiltro();
  const visivel = (campo: keyof ValoresFiltro) => !camposOcultos.includes(campo);

  const atualizar = (campo: keyof ValoresFiltro, valor: string) =>
    aoMudar({ ...valores, [campo]: valor });

  const perfilSelecionado = perfis.find((perfil) => perfil.id === valores.perfil_id);
  const professoresFiltrados = professores.filter(
    (professor) =>
      (!valores.curso || professor.curso_vinculado === valores.curso) &&
      (!perfilSelecionado || professor.perfil === perfilSelecionado.nome),
  );

  return (
    <div className="flex flex-wrap items-end gap-4">
      {visivel('perfil_id') && (
        <Campo rotulo="Perfil">
          <select
            className={classesInput}
            value={valores.perfil_id}
            onChange={(evento) =>
              aoMudar({ ...valores, perfil_id: evento.target.value, professor_id: '' })
            }
          >
            <option value="">Todos</option>
            {perfis.map((perfil) => (
              <option key={perfil.id} value={perfil.id}>
                {perfil.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {visivel('curso') && (
        <Campo rotulo="Curso">
          <select
            className={classesInput}
            value={valores.curso}
            onChange={(evento) =>
              aoMudar({
                ...valores,
                curso: evento.target.value,
                // Trocar de curso invalida o professor selecionado.
                professor_id: '',
              })
            }
          >
            <option value="">Todos</option>
            {cursos.map((curso) => (
              <option key={curso} value={curso}>
                {curso}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {visivel('professor_id') && (
        <Campo rotulo="Usuario">
          <select
            className={classesInput}
            value={valores.professor_id}
            onChange={(evento) => atualizar('professor_id', evento.target.value)}
          >
            <option value="">Todos</option>
            {professoresFiltrados.map((professor) => (
              <option key={professor.id} value={professor.id}>
                {professor.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {visivel('status') && (
        <Campo rotulo="Status">
          <select
            className={classesInput}
            value={valores.status}
            onChange={(evento) => atualizar('status', evento.target.value)}
          >
            <option value="">Todos</option>
            {STATUS_REGISTRO.map((status) => (
              <option key={status} value={status}>
                {ROTULOS_STATUS[status]}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {visivel('tipo') && (
        <Campo rotulo="Tipo">
          <select
            className={classesInput}
            value={valores.tipo}
            onChange={(evento) => atualizar('tipo', evento.target.value)}
          >
            <option value="">Todos</option>
            {TIPOS_REGISTRO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULOS_TIPO[tipo]}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {visivel('data_inicio') && (
        <Campo rotulo="De">
          <input
            type="date"
            className={classesInput}
            value={valores.data_inicio}
            onChange={(evento) => atualizar('data_inicio', evento.target.value)}
          />
        </Campo>
      )}

      {visivel('data_fim') && (
        <Campo rotulo="Ate">
          <input
            type="date"
            className={classesInput}
            value={valores.data_fim}
            onChange={(evento) => atualizar('data_fim', evento.target.value)}
          />
        </Campo>
      )}

      <Botao
        variante="secundario"
        type="button"
        onClick={() => aoMudar({ ...FILTRO_VAZIO })}
      >
        Limpar
      </Botao>
    </div>
  );
}
