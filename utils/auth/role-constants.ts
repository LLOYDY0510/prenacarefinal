import type { UserRole } from '@/types';

export const STAFF_ROLES: UserRole[] = ['admin', 'nurse', 'bhw'];
export const EDIT_ROLES: UserRole[] = ['bhw'];
export const USER_ROLES = ['patient', 'nurse', 'bhw', 'admin'] as const;

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function isStaffRole(role: string | null | undefined) {
  return !!role && STAFF_ROLES.includes(role as UserRole);
}
