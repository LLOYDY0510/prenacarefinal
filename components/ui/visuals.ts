import { LayoutDashboard, CalendarDays, ClipboardList, UserRound, HeartPulse, Leaf, ClipboardCheck, UsersRound, MapPinned, ChartNoAxesCombined, UserCog, MessagesSquare, History, type LucideIcon } from 'lucide-react';

// Serializable menu keys resolve to one consistent icon family in the UI.
export const navigationIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, 'my-schedule': CalendarDays, schedule: CalendarDays,
  'my-records': ClipboardList, pregnant: ClipboardList, 'my-info': UserRound,
  'risk-indicators': HeartPulse, 'nutrition-tips': Leaf, 'health-tips': Leaf,
  checkups: ClipboardCheck, bhw: UsersRound, 'risk-map': MapPinned,
  reports: ChartNoAxesCombined, users: UserCog, 'sms-log': MessagesSquare,
  'activity-logs': History,
};

export const pageIcons: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard, 'Nurse Dashboard': HeartPulse, 'Prenatal Schedule': CalendarDays,
  'Medical Record': ClipboardList, 'My Medical Record': ClipboardList, 'My Information': UserRound,
  'Pregnant Records': ClipboardList, 'Risk Indicators': HeartPulse, 'Health & Nutrition Tips': Leaf,
  'Prenatal Checkups': ClipboardCheck, 'BHW for Zones': UsersRound,
  'Geographic Risk Map': MapPinned, Reports: ChartNoAxesCombined,
  'User Management': UserCog, 'SMS & Broadcast Dispatch': MessagesSquare,
  'Activity Logs': History, 'Schedule history': History, 'My Records': ClipboardList,
};
