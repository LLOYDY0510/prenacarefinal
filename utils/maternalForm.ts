import { addDays } from '@/utils/calendar';

export const BLOOD_PRESSURE_OPTIONS = [
  '90/60',
  '100/60',
  '100/70',
  '110/70',
  '110/80',
  '120/80',
  '120/90',
  '130/85',
  '130/90',
  '140/90',
  '150/95',
  '160/100',
  '170/110',
  '180/120',
] as const;

export const HEIGHT_OPTIONS_CM = Array.from({ length: 61 }, (_, i) => 130 + i);
export const WEIGHT_OPTIONS_KG = Array.from({ length: 91 }, (_, i) => 30 + i);
export const GRAVIDA_OPTIONS = Array.from({ length: 11 }, (_, i) => i);
export const PARA_OPTIONS = Array.from({ length: 11 }, (_, i) => i);

export function isValidBloodPressure(value: string): boolean {
  const match = value.match(/^(\d{2,3})\/(\d{2,3})$/);
  if (!match) return false;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  return systolic > diastolic && systolic <= 250 && diastolic <= 150;
}

/** Naegele's rule: EDC = LMP + 280 days. */
export function eddFromLmp(lmp: string): string | null {
  return addDays(lmp, 280);
}
