import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { useAuth } from './contexto/AuthContext';
import { Jornada } from './paginas/Jornada';
import { Login } from './paginas/Login';
import { Pendentes } from './paginas/Pendentes';
import { Registros } from './paginas/Registros';

export function App() {
  const { usuario } = useAuth();

  if (!usuario) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/registros" element={<Registros />} />
        <Route path="/pendentes" element={<Pendentes />} />
        <Route path="/jornada" element={<Jornada />} />
        <Route path="*" element={<Navigate to="/registros" replace />} />
      </Route>
    </Routes>
  );
}
