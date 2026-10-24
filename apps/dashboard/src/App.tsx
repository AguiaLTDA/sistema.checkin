import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { useAuth } from './contexto/AuthContext';
import { Inicio } from './paginas/Inicio';
import { Jornada } from './paginas/Jornada';
import { Login } from './paginas/Login';
import { PainelUsuario } from './paginas/PainelUsuario';
import { Pendentes } from './paginas/Pendentes';
import { Perfis } from './paginas/Perfis';
import { Registros } from './paginas/Registros';
import { Usuarios } from './paginas/Usuarios';

/**
 * `/` e a pagina inicial com os dois acessos. `/rh/*` e o painel do RH e
 * `/usuario` o painel de quem bate ponto; cada um pede o proprio login.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/rh/*" element={<AreaRh />} />
      <Route path="/usuario/*" element={<AreaUsuario />} />

      {/* Enderecos antigos do dashboard, de antes da area /rh. */}
      <Route path="/registros" element={<Navigate to="/rh/registros" replace />} />
      <Route path="/pendentes" element={<Navigate to="/rh/pendentes" replace />} />
      <Route path="/jornada" element={<Navigate to="/rh/jornada" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AreaRh() {
  const { usuario } = useAuth('rh');
  if (!usuario) return <Login escopo="rh" />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="registros" element={<Registros />} />
        <Route path="pendentes" element={<Pendentes />} />
        <Route path="jornada" element={<Jornada />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="perfis" element={<Perfis />} />
        <Route path="*" element={<Navigate to="/rh/registros" replace />} />
      </Route>
    </Routes>
  );
}

function AreaUsuario() {
  const { usuario } = useAuth('usuario');
  if (!usuario) return <Login escopo="usuario" />;
  return <PainelUsuario />;
}
