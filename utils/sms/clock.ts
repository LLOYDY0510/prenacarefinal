/* Calendar helpers pinned to Asia/Manila. */

import { localDate } from '@/utils/calendar';

export function manilaDatePlusFor(days: number): string {
  return localDate(days);
}

export function manilaToday(): string {
  return manilaDatePlusFor(0);
}

export function manilaTomorrow(): string {
  return manilaDatePlusFor(1);
}

/** 0 = Sunday. Used to show a visit's weekday next to its date. */
export function weekdayLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'long' });
}

/** "in 3 days" / "today" / "2 days ago", relative to Manila. */
export function relativeDayLabel(dateString: string): string {
  const target = new Date(`${dateString}T00:00:00Z`).getTime();
  const today = new Date(`${manilaToday()}T00:00:00Z`).getTime();
  const diff = Math.round((target - today) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
}
