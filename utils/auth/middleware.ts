import { redirect } from 'next/navigation';
import { getCurrentProfile } from './roles';
import {
  canAccessPurok,
  hasPermission,
  ROLE_PERMISSIONS,
} from './permissions';
import type { UserRole } from '@/types';

type PermissionKey = keyof typeof ROLE_PERMISSIONS[UserRole];

async function requireAuth() {
  const result = await getCurrentProfile();
  if (!result.user) redirect('/login');
  if (result.profile?.account_status !== 'active') redirect('/dashboard');
  const role = (result.profile?.role ?? 'pending') as UserRole;
  return { ...result, role };
}

/**
 * Middleware to protect routes based on role and permissions
 * Use this in server components to ensure users have proper access
 */
export async function requirePermission(permission: PermissionKey) {
  const result = await requireAuth();
  if (!hasPermission(result.role, permission)) {
    redirect('/dashboard');
  }
  return result;
}

/**
 * Middleware to protect routes that require user management access
 */
export async function requireUserManagement() {
  return requirePermission('canManageUsers');
}

/**
 * Middleware to protect routes that require BHW management access
 * Admin and bhw_head can manage BHW assignments
 */
export async function requireBhwManagement() {
  const result = await requireAuth();
  if (result.profile?.account_status !== 'active' || !(result.role === 'admin' || (result.role === 'bhw' && result.profile?.can_manage_bhw))) {
    redirect('/dashboard');
  }
  return result;
}

/**
 * Middleware to protect routes that require role management access
 */
export async function requireRoleManagement() {
  return requirePermission('canManageRoles');
}

/**
 * Middleware to protect routes that require risk map editing access
 */
export async function requireRiskMapEdit() {
  return requirePermission('canEditRiskMap');
}

/**
 * Middleware to protect routes that require health tips management access
 */
export async function requireHealthTipsManagement() {
  return requirePermission('canManageHealthTips');
}

/**
 * Middleware to protect routes that require risk indicators management access
 */
export async function requireRiskIndicatorsManagement() {
  return requirePermission('canManageRiskIndicators');
}

/**
 * Middleware to protect routes that require access to a specific purok
 */
export async function requirePurokAccess(targetPurok: string | null) {
  const result = await requireAuth();
  if (!canAccessPurok(result.role, result.profile?.purok ?? null, targetPurok)) {
    redirect('/dashboard');
  }
  return result;
}
