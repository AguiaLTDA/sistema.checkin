import { Link } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContext';

interface Area {
  para: string;
  titulo: string;
  publico: string;
  botao: string;
  funcionalidades: string[];
  destaque: boolean;
}

const AREAS: Area[] = [
  {
    para: '/rh',
    titulo: 'Painel do RH',
    publico: 'RH e coordenacao',
    botao: 'Entrar no Painel do RH',
    destaque: true,
    funcionalidades: [
      'Registros de ponto de todos os usuarios, com filtros',
      'Aprovacao ou rejeicao de registros pendentes, com justificativa',
      'Relatorio de jornada com horas trabalhadas e exportacao CSV',
      'Cadastro de usuarios: criar, editar, desativar, apagar e redefinir senha',
      'Perfis: Professor, Estagiario, Estudante e outros que o RH criar',
    ],
  },
  {
    para: '/usuario',
    titulo: 'Painel do Usuario',
    publico: 'Professores, estagiarios e estudantes',
    botao: 'Entrar no Painel do Usuario',
    destaque: false,
    funcionalidades: [
      'Marcar chegada e saida; a presenca e validada pela localizacao',
      'Senha temporaria dada pelo RH, trocada no primeiro acesso',
      'Ver o ultimo registro e qual o proximo esperado',
      'Status de cada registro: validado, pendente ou rejeitado',
      'Historico de registros com distancia ate o campus',
      'Dados do proprio cadastro: perfil e curso',
    ],
  },
];

/** Pagina inicial: os dois acessos lado a lado, centralizados. */
export function Inicio() {
  const rh = useAuth('rh');
  const usuario = useAuth('usuario');
  const logado: Record<string, string | undefined> = {
    '/rh': rh.usuario?.nome,
    '/usuario': usuario.usuario?.nome,
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-univc-900 px-4 py-12">
      <div className="text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-widest text-univc-100">
          Centro Universitario Vale do Cricare
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">UNIVC Check-in</h1>
        <p className="mx-auto mt-3 max-w-xl text-univc-100">
          Controle de presenca com validacao por localizacao. Escolha a sua area
          de acesso.
        </p>
      </div>

      <div className="mt-10 grid w-full max-w-4xl gap-6 md:grid-cols-2">
        {AREAS.map((area) => (
          <section
            key={area.para}
            className="flex flex-col rounded-2xl bg-white p-6 shadow-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-univc-500">
              {area.publico}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {area.titulo}
            </h2>

            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-slate-600">
              {area.funcionalidades.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-emerald-600">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              to={area.para}
              className={`mt-6 block rounded-xl px-5 py-3 text-center text-base font-semibold shadow-sm transition ${
                area.destaque
                  ? 'bg-univc-700 text-white hover:bg-univc-900'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {logado[area.para] ? `Continuar como ${logado[area.para]}` : area.botao}
            </Link>
          </section>
        ))}
      </div>

      <p className="mt-8 max-w-xl text-center text-xs text-univc-100">
        O acesso de cada usuario e criado pelo RH. Nenhum dado biometrico e
        coletado ou armazenado.
      </p>
    </div>
  );
}
