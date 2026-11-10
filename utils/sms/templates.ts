/**
 * Message copy for prenatal reminders.
 *
 * Wording is Filipino, matching what the barangay already sends, and is kept in
 * one place so the manual button and the automatic job can never drift apart.
 * High-risk mothers get a stronger wording; everyone else gets the standard one.
 */

import { smsCenterLabel } from './center';

const HIGH_RISK_NOTE = 'Mataas po ang inyong risk — mahalaga ang bawat prenatal checkup.';

export function prenatalReminderMessage(visitDate: string, timeLabel?: string | null, highRisk = false): string {
  const when = timeLabel?.trim() ? ` (${timeLabel.trim()})` : '';
  const base = `Paalala: Bukas (${visitDate})${when} po ang inyong prenatal checkup sa ${smsCenterLabel()}. Mangyaring pumunta sa nakatakdang oras.`;
  return highRisk ? `${base} ${HIGH_RISK_NOTE} Salamat!` : `${base} Salamat!`;
}

export function prenatalReminderMessageToday(visitDate: string, timeLabel?: string | null, highRisk = false): string {
  const when = timeLabel?.trim() ? ` (${timeLabel.trim()})` : '';
  const base = `Paalala: Ngayong araw (${visitDate})${when} po ang inyong prenatal checkup sa ${smsCenterLabel()}. Mangyaring pumunta sa nakatakdang oras.`;
  return highRisk ? `${base} ${HIGH_RISK_NOTE} Salamat!` : `${base} Salamat!`;
}

const VISIT_ORDINALS = ['1st', '2nd', '3rd'];

/* Booking confirmation for a newly saved schedule. Migration 035 builds this same text in SQL. */
export function scheduleConfirmationMessage(visitDate: string, trimester: string, visitNumber: number): string {
  const visit = `${VISIT_ORDINALS[visitNumber - 1] ?? `${visitNumber}th`} Visit`;
  return `Nakatakda po ang inyong prenatal checkup sa ${visitDate} sa Barangay Health Center (${trimester} Trimester, ${visit}). Mangyaring pumunta sa nakatakdang araw. Salamat!`;
}

export function missedVisitMessage(visitDate: string, highRisk = false): string {
  const base = `Paalala: Hindi kayo nakadalo sa prenatal visit noong ${visitDate}. Mangyaring pumunta sa ${smsCenterLabel()} sa pinakamabalanggang panahon para sa follow-up schedule.`;
  return highRisk ? `${base} ${HIGH_RISK_NOTE} Salamat!` : `${base} Salamat!`;
}

/** Semaphore counts characters; a 10-part message is the common PH plan. */
export function countSmsSegments(message: string): number {
  const length = [...message].length;
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}

export function estimateCredits(message: string, recipients: number): number {
  return countSmsSegments(message) * recipients;
}
