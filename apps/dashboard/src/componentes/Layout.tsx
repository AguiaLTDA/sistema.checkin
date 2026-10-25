import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContext';

const ABAS = [
  { para: '/rh/registros', rotulo: 'Registros' },
  { para: '/rh/pendentes', rotulo: 'Aprovacoes pendentes' },
  { para: '/rh/jornada', rotulo: 'Relatorio de jornada' },
  { para: '/rh/usuarios', rotulo: 'Usuarios' },
  { para: '/rh/perfis', rotulo: 'Perfis' },
];

/** Moldura da area do RH: cabecalho, abas e atalho para o painel do usuario. */
export function Layout() {
  const { usuario, sair } = useAuth('rh');

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-univc-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo-univc-branco.png" alt="UNIVC" className="h-9" />
            <div className="hidden border-l border-white/20 pl-3 sm:block">
              <p className="text-sm font-semibold">Check-in · Painel do RH</p>
              <p className="text-xs text-univc-100">
                Controle de presenca — RH e coordenacao
              </p>
            </div>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              to="/usuario"
              className="rounded-lg bg-white px-3 py-1.5 font-semibold text-univc-900 shadow-sm transition hover:bg-univc-100"
            >
              Painel do Usuario →
            </Link>
            <span className="text-univc-100">{usuario?.nome}</span>
            <button
              type="button"
              onClick={() => void sair()}
              className="rounded-lg bg-white/10 px-3 py-1.5 font-medium transition hover:bg-white/20"
            >
              Sair
            </button>
          </div>
        </div>
        <nav className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {ABAS.map((aba) => (
              <NavLink
                key={aba.para}
                to={aba.para}
                className={({ isActive }) =>
                  `whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-univc-100 hover:text-white'
                  }`
                }
              >
                {aba.rotulo}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        A presenca e comprovada apenas pela localizacao do aparelho no momento
        do registro. Nenhum dado biometrico e coletado ou armazenado.
      </footer>
    </div>
  );
}
