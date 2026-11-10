export type ZoneProgramMetrics = {
  zone: string;
  registered: number;
  known_age: number;
  adolescents: number;
  high_risk: number;
  overdue: number;
  unknown_date: number;
  reachable: number;
};

export type ZoneProgram = ZoneProgramMetrics & {
  program_id: number;
  title: string;
  activities: string;
  announcement: string;
  reason: string;
  eligible: boolean;
  assessment_current: boolean;
  identified_count: number | null;
  assessed_on: string | null;
  note: string | null;
  campaign_id: string | null;
  sent_at: string | null;
  recipient_count: number | null;
  revision: string;
};

export type ZoneProgramSummary = {
  computedAt: string;
  period: string;
  zones: ZoneProgramMetrics[];
  recommendations: ZoneProgram[];
};

export const ASSESSMENT_PROGRAMS = new Set([2, 5, 6, 7, 8]);
