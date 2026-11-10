export const ZONE_COLORS: Record<string, string> = {
  '1': '#14532D',
  '2': '#166534',
  '3': '#15803D',
  '4': '#16A34A',
  '5': '#22C55E',
  '6': '#4ADE80',
  '7': '#86EFAC',
  '8': '#BBF7D0',
};
export const UNASSIGNED_COLOR = '#D4D4D4';

export const AGE_GROUP_COLORS: Record<string, string> = {
  '10-14': '#16A34A',
  '15-19': '#166534',
  '20-49': '#14532D',
};


export function registrySummary(records: { purok: string | null; risk_level: string | null; age: number | null }[]) {
  const risk = riskSummary(records);
  const byPurok: Record<string,number> = {};
  const byAgeGroup: Record<string,number> = { '10-14': 0, '15-19': 0, '20-49': 0 };
  for (const row of records) {
    const purok = row.purok || 'Unassigned';
    byPurok[purok] = (byPurok[purok] || 0) + 1;
    if (row.age == null) continue;
    if (row.age >= 10 && row.age <= 14) byAgeGroup['10-14']++;
    else if (row.age >= 15 && row.age <= 19) byAgeGroup['15-19']++;
    else if (row.age >= 20 && row.age <= 49) byAgeGroup['20-49']++;
  }
  return { ...risk, byPurok, byAgeGroup,
    purokEntries: Object.entries(byPurok).sort((a,b)=>a[0].localeCompare(b[0])),
    maxPurokCount: Math.max(1,...Object.values(byPurok)),
    maxAgeCount: Math.max(1,...Object.values(byAgeGroup)), AGE_GROUPS: ['10-14','15-19','20-49'] as const };
}

export function riskSummary(records: { risk_level: string | null }[]) {
  const total = records.length;
  const highRisk = records.filter((row) => row.risk_level === 'high').length;
  const lowRisk = records.filter((row) => row.risk_level === 'low').length;
  const unassessed = total - highRisk - lowRisk;
  const highPct = total ? Math.round(highRisk / total * 100) : 0;
  const lowPct = total ? Math.min(100 - highPct, Math.round(lowRisk / total * 100)) : 0;
  return { total, highRisk, lowRisk, unassessed, highPct, lowPct };
}
