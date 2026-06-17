import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** OLLI mascot: rounded blue head, dark visor, two frost eyes, antenna. */
function OlliMascot() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <line x1="24" y1="11" x2="24" y2="5.5" stroke="#34C6D9" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="4.5" r="2.7" fill="#34C6D9" />
      <rect x="7" y="11" width="34" height="29" rx="11" fill="#0B6FCE" />
      <rect x="11.5" y="16" width="25" height="18" rx="9" fill="#0A1626" />
      <circle cx="19.5" cy="25" r="3.2" fill="#7FE9F5" />
      <circle cx="29.5" cy="25" r="3.2" fill="#7FE9F5" />
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Visão geral',
    end: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/orcamentos',
    label: 'Orçamentos',
    end: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    ),
  },
  {
    to: '/clientes',
    label: 'Clientes',
    end: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
  {
    to: '/servicos',
    label: 'Serviços',
    end: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18v3h3l6.5-6.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.1-.6-.6-2.1z" />
      </svg>
    ),
  },
  {
    to: '/produtos',
    label: 'Produtos',
    end: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5M12 13v8" />
      </svg>
    ),
  },
];

/** App shell: dark cockpit sidebar nav + logout, with routed content. */
export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Usuário';
  const initial = displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <OlliMascot />
          <div>
            <div className="brand-name">OLLI</div>
            <div className="brand-sub">GR TECH</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initial}</div>
            <div className="user-meta">
              <div className="user-name" title={displayName}>
                {displayName}
              </div>
              <div className="user-role">Administrador</div>
              <div className="user-email" title={user?.email ?? ''}>
                {user?.email}
              </div>
            </div>
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
