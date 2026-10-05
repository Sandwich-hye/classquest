import { createContext, useContext, useState, type ReactNode } from 'react';

export type Role = 'student' | 'teacher' | 'admin';

interface Session {
  token: string;
  role: Role;
  displayName: string;
}

interface AuthContextValue {
  session: Session | null;
  login: (s: Session) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readSession(): Session | null {
  const token = localStorage.getItem('cq_token');
  const role = localStorage.getItem('cq_role') as Role | null;
  const displayName = localStorage.getItem('cq_name');
  if (token && role && displayName) return { token, role, displayName };
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession);

  const login = (s: Session) => {
    localStorage.setItem('cq_token', s.token);
    localStorage.setItem('cq_role', s.role);
    localStorage.setItem('cq_name', s.displayName);
    setSession(s);
  };
  const logout = () => {
    localStorage.removeItem('cq_token');
    localStorage.removeItem('cq_role');
    localStorage.removeItem('cq_name');
    setSession(null);
  };

  return <AuthContext.Provider value={{ session, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
