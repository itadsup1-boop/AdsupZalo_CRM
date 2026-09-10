export type CrmRole = 'owner' | 'admin' | 'branch_manager' | 'sale' | 'cskh' | 'marketing' | 'member';

export type Permission =
  | 'contacts:read'
  | 'contacts:update'
  | 'contacts:delete'
  | 'contacts:assign'
  | 'chat:read'
  | 'chat:update'
  | 'appointments:read'
  | 'appointments:update'
  | 'notifications:read'
  | 'reports:read'
  | 'settings:manage'
  | 'ai:config'
  | 'ai:audit:read'
  | 'ai:review:manage'
  | 'assignment:manage';

export const ROLE_PERMISSIONS: Record<CrmRole, Permission[]> = {
  owner: [
    'contacts:read', 'contacts:update', 'contacts:delete', 'contacts:assign',
    'chat:read', 'chat:update', 'appointments:read', 'appointments:update',
    'notifications:read', 'reports:read', 'settings:manage', 'ai:config',
    'ai:audit:read', 'ai:review:manage', 'assignment:manage',
  ],
  admin: [
    'contacts:read', 'contacts:update', 'contacts:delete', 'contacts:assign',
    'chat:read', 'chat:update', 'appointments:read', 'appointments:update',
    'notifications:read', 'reports:read', 'settings:manage', 'ai:config',
    'ai:audit:read', 'ai:review:manage', 'assignment:manage',
  ],
  branch_manager: [
    'contacts:read', 'contacts:update', 'contacts:assign',
    'chat:read', 'chat:update', 'appointments:read', 'appointments:update',
    'notifications:read', 'reports:read', 'ai:audit:read', 'ai:review:manage',
  ],
  sale: [
    'contacts:read', 'contacts:update', 'chat:read', 'chat:update',
    'appointments:read', 'appointments:update', 'notifications:read',
  ],
  cskh: [
    'contacts:read', 'contacts:update', 'chat:read', 'chat:update',
    'appointments:read', 'appointments:update', 'notifications:read', 'ai:audit:read',
  ],
  marketing: [
    'contacts:read', 'reports:read', 'notifications:read',
  ],
  member: [
    'contacts:read', 'contacts:update', 'chat:read', 'chat:update',
    'appointments:read', 'appointments:update', 'notifications:read',
  ],
};

export function hasPermission(role: string, permission: Permission) {
  return (ROLE_PERMISSIONS[(role as CrmRole) || 'member'] || ROLE_PERMISSIONS.member).includes(permission);
}

export function normalizeRole(role: string): CrmRole {
  if (role === 'manager') return 'branch_manager';
  if (role === 'staff') return 'sale';
  if (role in ROLE_PERMISSIONS) return role as CrmRole;
  return 'member';
}
