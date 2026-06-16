import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Painel', end: true },
  { to: '/orcamentos', label: 'Orçamentos', end: false },
  { to: '/clientes', label: 'Clientes', end: false },
  { to: '/servicos', label: 'Serviços', end: false },
  { to: '/produtos', label: 'Produtos', end: false },
];

/** App shell: sidebar nav + logout, with routed content in the main area. */
export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">OLLI</div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-email" title={user?.email ?? ''}>
            {user?.email}
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
