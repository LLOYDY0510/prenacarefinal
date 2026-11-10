import type { UserRole } from '@/types';

// Define access permissions for each role
export const ROLE_PERMISSIONS = {
  admin: {
    canViewAllRecords: true,
    canManageUsers: true,
    canManageRoles: true,
    canViewRiskMap: false,
    canEditRiskMap: false,
    canViewAllPuroks: false,
    canManageAllPuroks: false,
    canSendSMS: false,
    canManageHealthTips: false,
    canManageRiskIndicators: false,
    canViewReports: false,
    canManageReferrals: false,
    canManageSchedules: true,
    canManageCheckups: false,
    canManageFollowUps: false,
  },
  nurse: {
    canViewAllRecords: false,
    canManageUsers: false,
    canManageRoles: false,
    canViewRiskMap: false,
    canEditRiskMap: false,
    canViewAllPuroks: true,
    canManageAllPuroks: false,
    canSendSMS: true,
    canManageHealthTips: true,
    canManageRiskIndicators: true,
    canViewReports: false,
    canManageReferrals: true,
    canManageSchedules: false,
    canManageCheckups: false,
    canManageFollowUps: true,
  },
  bhw: {
    canViewAllRecords: false,
    canManageUsers: false,
    canManageRoles: false,
    canViewRiskMap: true,
    canEditRiskMap: false,
    canViewAllPuroks: false,
    canManageAllPuroks: false,
    canSendSMS: true,
    canManageHealthTips: false,
    canManageRiskIndicators: false,
    canViewReports: true,
    canManageReferrals: false,
    canManageSchedules: false,
    canManageCheckups: true,
    canManageFollowUps: true,
  },
  patient: {
    canViewAllRecords: false,
    canManageUsers: false,
    canManageRoles: false,
    canViewRiskMap: false,
    canEditRiskMap: false,
    canViewAllPuroks: false,
    canManageAllPuroks: false,
    canSendSMS: false,
    canManageHealthTips: false,
    canManageRiskIndicators: false,
    canViewReports: false,
    canManageReferrals: false,
    canManageSchedules: false,
    canManageCheckups: false,
    canManageFollowUps: false,
  },
} as const;

// Helper function to check if a role has a specific permission
export function hasPermission(role: UserRole | string | null | undefined, permission: keyof typeof ROLE_PERMISSIONS[UserRole]): boolean {
  if (!role) return false;
  const normalizedRole = role as UserRole;
  return ROLE_PERMISSIONS[normalizedRole]?.[permission] ?? false;
}

// Helper function to check if a user can access a specific purok
export function canAccessPurok(userRole: UserRole | string | null | undefined, userPurok: string | null, targetPurok: string | null, allZones = false): boolean {
  if (!userRole) return false;

  if (['admin', 'nurse'].includes(userRole)) return true;
  if (userRole === 'bhw' && allZones) return true;
  if (userRole === 'bhw') return !!userPurok && userPurok === targetPurok;

  return false;
}

// Helper function to check if a user can manage users
export function canManageUsers(role: UserRole | string | null | undefined): boolean {
  // Only admin can manage users
  return hasPermission(role, 'canManageUsers');
}

// Helper function to check if a user can manage roles
export function canManageRoles(role: UserRole | string | null | undefined): boolean {
  // Only admin can manage roles
  return hasPermission(role, 'canManageRoles');
}

// Helper function to check if a user can edit the risk map
export function canEditRiskMap(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canEditRiskMap');
}

// Helper function to check if a user can manage health tips
export function canManageHealthTips(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canManageHealthTips');
}

// Helper function to check if a user can manage risk indicators
export function canManageRiskIndicators(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canManageRiskIndicators');
}

// Helper function to check if a user can send SMS
export function canSendSMS(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canSendSMS');
}

// Helper function to check if a user can view reports
export function canViewReports(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canViewReports');
}

// Helper function to check if a user can manage referrals
export function canManageReferrals(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canManageReferrals');
}

// Helper function to check if a user can manage schedules
export function canManageSchedules(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, 'canManageSchedules');
}
