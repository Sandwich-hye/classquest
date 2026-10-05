import { useState } from 'react';
import { useAuth } from './auth';
import { Login } from './pages/Login';
import { Library } from './pages/Library';
import { TeacherPortal } from './pages/TeacherPortal';
import { Dashboard } from './pages/Dashboard';
import { Layout, type NavItem } from './components/Layout';

const NAV: NavItem[] = [
  { key: 'library', label: 'Library', roles: ['student', 'teacher', 'admin'] },
  { key: 'teacher', label: 'Teacher Portal', roles: ['teacher', 'admin'] },
  { key: 'dashboard', label: 'Operations Dashboard', roles: ['teacher', 'admin'] },
];

const TITLES: Record<string, string> = {
  library: 'Learning Portal / Library',
  teacher: 'Teacher Portal / Publish',
  dashboard: 'Operations / Cloud Dashboard',
};

export function App() {
  const { session } = useAuth();
  const [active, setActive] = useState('library');

  if (!session) return <Login />;

  // Default a fresh non-student to the dashboard-rich area, students to library.
  const role = session.role;
  const allowed = NAV.filter((n) => n.roles.includes(role)).map((n) => n.key);
  const current = allowed.includes(active) ? active : allowed[0];

  return (
    <Layout nav={NAV} active={current} onNavigate={setActive} title={TITLES[current] ?? 'ClassQuest'}>
      {current === 'library' && <Library />}
      {current === 'teacher' && <TeacherPortal />}
      {current === 'dashboard' && <Dashboard />}
    </Layout>
  );
}
