import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { defaultRouteFor, type Role } from '../navigation';

/**
 * Route guard.
 *  - no session            -> /login (remembering where the user was going)
 *  - session, wrong role   -> that role's default page
 *  - otherwise             -> render
 * The backend enforces the same rules (requireRole); this only shapes the UI.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(session.role)) return <Navigate to={defaultRouteFor(session.role)} replace />;
  return <>{children}</>;
}

/** Sends a signed-in user to their default page; anyone else to /login. */
export function DefaultRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? defaultRouteFor(session.role) : '/login'} replace />;
}
