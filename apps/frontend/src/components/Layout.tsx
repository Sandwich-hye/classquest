import type { ReactNode } from 'react';
import { useAuth, type Role } from '../auth';
import { Logo } from './Logo';

export interface NavItem {
  key: string;
  label: string;
  roles: Role[];
}

export function Layout({
  nav,
  active,
  onNavigate,
  title,
  children,
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  title: string;
  children: ReactNode;
}) {
  const { session, logout } = useAuth();
  const role = session?.role ?? 'student';
  const visible = nav.filter((n) => n.roles.includes(role));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <b>ClassQuest</b>
        </div>
        {visible.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${active === n.key ? 'active' : ''}`}
            onClick={() => onNavigate(n.key)}
          >
            {n.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="user">
          <div style={{ color: '#fff', fontWeight: 600 }}>{session?.displayName}</div>
          <div style={{ textTransform: 'capitalize' }}>{role}</div>
          <button className="nav-item" style={{ marginTop: 8 }} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="title">{title}</div>
          <div className="title">Research prototype · INFS803 · LocalStack</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
