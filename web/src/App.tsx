import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrcamentosPage } from './pages/OrcamentosPage';
import { ClientesPage } from './pages/ClientesPage';
import { ServicosPage } from './pages/ServicosPage';
import { ProdutosPage } from './pages/ProdutosPage';

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected app shell */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="orcamentos" element={<OrcamentosPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="servicos" element={<ServicosPage />} />
        <Route path="produtos" element={<ProdutosPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
