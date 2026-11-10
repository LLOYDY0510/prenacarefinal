import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from './roles';
import { hasPermission, type ROLE_PERMISSIONS } from './permissions';
import { isUserRole } from './role-constants';
import type { UserRole } from '@/types';

type Permission = keyof typeof ROLE_PERMISSIONS[UserRole];

export async function requireApiPermission(permission?: Permission) {
  const context = await getCurrentProfile();
  if (!context.user) return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  if (!context.profile || context.profile.account_status !== 'active' || !isUserRole(context.profile.role)) {
    return { error: NextResponse.json({ error: 'A valid account role is required.' }, { status: 403 }) };
  }
  const role = context.profile.role;
  if (permission && !hasPermission(role, permission)) {
    return { error: NextResponse.json({ error: 'You are not authorized for this action.' }, { status: 403 }) };
  }
  return { ...context, user: context.user, profile: context.profile, role, error: undefined };
}
