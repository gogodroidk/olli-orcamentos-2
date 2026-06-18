import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrcamentosPage } from './pages/OrcamentosPage';
import { OrcamentoDetalhePage } from './pages/OrcamentoDetalhePage';
import { ClientesPage } from './pages/ClientesPage';
import { ClienteDetalhePage } from './pages/ClienteDetalhePage';
import { ServicosPage } from './pages/ServicosPage';
import { ProdutosPage } from './pages/ProdutosPage';
import { FinanceiroPage } from './pages/FinanceiroPage';

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
        <Route path="orcamentos/:id" element={<OrcamentoDetalhePage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="clientes/:id" element={<ClienteDetalhePage />} />
        <Route path="servicos" element={<ServicosPage />} />
        <Route path="produtos" element={<ProdutosPage />} />
        <Route path="financeiro" element={<FinanceiroPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
