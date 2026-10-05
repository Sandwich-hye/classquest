import { useState } from 'react';
import { api, type ApiError } from '../api';
import { useAuth, type Role } from '../auth';
import { Logo } from '../components/Logo';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('teacher@classquest.example');
  const [password, setPassword] = useState('DemoTeacher123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(email, password);
      login({ token: r.token, role: r.role as Role, displayName: r.displayName });
    } catch (err) {
      setError((err as ApiError).message ?? 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function seed() {
    setSeeding(true);
    setError(null);
    try {
      await api.demoSeed();
      setError('Demo data seeded. You can now sign in with the sample credentials below.');
    } catch (err) {
      setError((err as ApiError).message ?? 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Logo size={34} />
          <h1 style={{ margin: 0 }}>ClassQuest</h1>
        </div>
        <div className="sub">Cloud computing prototype — K-12 learning platform (AWS three-tier)</div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && <div className="err-text">{error}</div>}

        <div className="cred-hint">
          <b>First run?</b> Click to load the labelled sample dataset.
          <div style={{ marginTop: 8 }}>
            <button className="btn ghost" style={{ width: '100%' }} onClick={seed} disabled={seeding}>
              {seeding ? 'Seeding…' : 'Seed demo data'}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            Sample logins (DEMO):
            <br />
            <code>teacher@classquest.example</code> / <code>DemoTeacher123!</code>
            <br />
            <code>student@classquest.example</code> / <code>DemoStudent123!</code>
            <br />
            <code>admin@classquest.example</code> / <code>DemoAdmin123!</code>
          </div>
        </div>
      </div>
    </div>
  );
}
