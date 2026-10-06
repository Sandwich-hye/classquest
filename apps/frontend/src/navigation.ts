/**
 * Role-aware navigation: the single source of truth for which routes each
 * role may use, what the sidebar shows, and where each role lands by default.
 * Kept free of React so it can be unit tested.
 */
export type Role = 'student' | 'teacher' | 'admin';

export type IconName =
  | 'home' | 'library' | 'progress' | 'dashboard' | 'publish' | 'operations'
  | 'bell' | 'search' | 'logout' | 'chevron-down' | 'inbox' | 'lock'
  | 'document' | 'book' | 'video' | 'external' | 'upload-cloud' | 'check' | 'x' | 'alert' | 'refresh';

export interface RouteDef {
  path: string;
  label: string;
  icon: IconName;
  roles: Role[];
}

/** Every authenticated route. Order within a role's nav is set by NAV_ORDER. */
export const ROUTES: Record<string, RouteDef> = {
  home: { path: '/home', label: 'Home', icon: 'home', roles: ['student'] },
  dashboard: { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['teacher'] },
  library: { path: '/library', label: 'Library', icon: 'library', roles: ['student', 'teacher', 'admin'] },
  progress: { path: '/progress', label: 'My Progress', icon: 'progress', roles: ['student'] },
  publish: { path: '/publish', label: 'Publish Resource', icon: 'publish', roles: ['teacher'] },
  operations: { path: '/operations', label: 'Operations', icon: 'operations', roles: ['teacher', 'admin'] },
};

const NAV_ORDER: Record<Role, Array<keyof typeof ROUTES>> = {
  student: ['home', 'library', 'progress'],
  teacher: ['dashboard', 'library', 'publish', 'operations'],
  admin: ['operations', 'library'],
};

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Administrator',
};

export function isRole(value: unknown): value is Role {
  return value === 'student' || value === 'teacher' || value === 'admin';
}

export function navFor(role: Role): RouteDef[] {
  return NAV_ORDER[role].map((key) => ROUTES[key]);
}

export function defaultRouteFor(role: Role): string {
  return navFor(role)[0].path;
}

export function canAccess(role: Role, path: string): boolean {
  return navFor(role).some((r) => r.path === path);
}

/** Title for the TopBar context area; undefined for unknown paths. */
export function routeLabel(path: string): string | undefined {
  return Object.values(ROUTES).find((r) => r.path === path)?.label;
}
