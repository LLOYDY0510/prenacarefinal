import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/utils/auth/roles';
import { checkAndSendPrenatalReminders } from '@/utils/checkPrenatalReminders';
import Sidebar from '@/components/layout/Sidebar';
import SessionPersistenceGuard from '@/components/auth/SessionPersistenceGuard';

export const dynamic = 'force-dynamic';
const MENUS: Record<string, [string,string][]> = {
  patient: [['Dashboard',''],['Prenatal Schedule','my-schedule'],['Medical Record','my-records'],['My Information','my-info']],
  nurse: [['Dashboard',''],['Risk Indicators','risk-indicators'],['Health & Nutrition Tips','nutrition-tips']],
  bhw: [['Dashboard',''],['BHW for Zones','bhw'],['Pregnant Records','pregnant'],['Risk Map','risk-map'],['Prenatal Checkups','checkups'],['SMS & Broadcast Dispatch','sms-log'],['Reports','reports']],
  admin: [['Dashboard',''],['BHW for Zones','bhw'],['Pregnant Records','pregnant'],['Risk Map','risk-map'],['Prenatal Checkups','checkups'],['User Management','users'],['Prenatal Schedule','schedule'],['Activity Logs','activity-logs']],
};
export default async function DashboardLayout({children,modal}: {children: React.ReactNode;modal:React.ReactNode}) {
  const {user,profile} = await getCurrentProfile();
  if (!user) redirect('/login');
  const active = profile?.account_status === 'active';
  // Automatic prenatal reminders and missed-visit follow-ups run on dashboard
  // traffic; the job serialises concurrent callers and dedupes per schedule.
  if (active) void checkAndSendPrenatalReminders();
  const menuItems = (active ? MENUS[profile.role ?? ''] ?? [] : []).map(([label,path]) => ({label,href: '/dashboard'+(path ? '/'+path : '')}));
  return <><SessionPersistenceGuard/><Sidebar role={profile?.role ?? 'patient'} fullName={profile?.full_name} email={user.email} notifications={[]} menuItems={menuItems}>{children}{modal}</Sidebar></>;
}
