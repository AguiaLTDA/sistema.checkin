import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexto/AuthContext';
import { Historico } from './paginas/Historico';
import { Login } from './paginas/Login';
import { Principal } from './paginas/Principal';
import { TrocarSenha } from './paginas/TrocarSenha';

export function App() {
  const { usuario } = useAuth();

  if (!usuario) return <Login />;
  if (usuario.deve_trocar_senha) return <TrocarSenha />;

  return (
    <Routes>
      <Route path="/" element={<Principal />} />
      <Route path="/historico" element={<Historico />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
