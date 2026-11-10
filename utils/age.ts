import { localDate, validDate } from '@/utils/calendar';

export function calculateAge(dateOfBirth: string | null | undefined, today = new Date()): number | null {
  if (!dateOfBirth) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && !validDate(dateOfBirth)) return null;
  const parsed = new Date(dateOfBirth);
  if (!Number.isFinite(parsed.getTime())) return null;
  const birth = validDate(dateOfBirth) ? dateOfBirth : parsed.toISOString().slice(0, 10);
  const current = localDate(0, today);
  const [year, month, day] = current.split('-').map(Number);
  const [birthYear, birthMonth, birthDay] = birth.split('-').map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age--;

  return age >= 0 ? age : null;
}

export function getRecordAge(age: number | null | undefined, dateOfBirth?: string | null): number | null {
  // Prioritize date_of_birth calculation, fall back to age field
  const calculatedAge = calculateAge(dateOfBirth);
  if (calculatedAge !== null && calculatedAge > 0) {
    return calculatedAge;
  }
  return age ?? null;
}
