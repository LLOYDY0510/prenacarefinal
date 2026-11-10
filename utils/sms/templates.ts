/**
 * Message copy for prenatal reminders.
 *
 * Wording is Filipino, matching what the barangay already sends, and is kept in
 * one place so the manual button and the automatic job can never drift apart.
 * High-risk mothers get a stronger wording; everyone else gets the standard one.
 */

import { smsCenterLabel } from './center';

const HIGH_RISK_NOTE = 'Taas kaayo ang inyong risk — importante ang matag prenatal check-up.';

export function prenatalReminderMessage(visitDate: string, timeLabel?: string | null, highRisk = false): string {
  const when = timeLabel?.trim() ? ` (${timeLabel.trim()})` : '';
  const base = `Paalala: Bubtad (${visitDate})${when} ang inyong prenatal check-up sa ${smsCenterLabel()}. Palihug tangtanga sa takdang oras.`;
  return highRisk ? `${base} ${HIGH_RISK_NOTE} Salamat!` : `${base} Salamat!`;
}

export function prenatalReminderMessageToday(visitDate: string, timeLabel?: string | null, highRisk = false): string {
  const when = timeLabel?.trim() ? ` (${timeLabel.trim()})` : '';
  const base = `Paalala: Karong adlawa (${visitDate})${when} ang inyong prenatal check-up sa ${smsCenterLabel()}. Palihug tangtanga sa takdang oras.`;
  return highRisk ? `${base} ${HIGH_RISK_NOTE} Salamat!` : `${base} Salamat!`;
}

const VISIT_ORDINALS = ['1st', '2nd', '3rd'];

/* Booking confirmation for a newly saved schedule. Migration 035 builds this same text in SQL. */
export function scheduleConfirmationMessage(visitDate: string, trimester: string, visitNumber: number): string {
  const visit = `${VISIT_ORDINALS[visitNumber - 1] ?? `${visitNumber}th`} Visit`;
  return `Nakatakda po ang inyong prenatal checkup sa ${visitDate} sa Barangay Health Center (${trimester} Trimester, ${visit}). Mangyaring pumunta sa nakatakdang araw. Salamat!`;
}

export function missedVisitMessage(visitDate: string, highRisk = false): string {
  const base = `Paalala: Wala kay nakadalo sa prenatal visit kaniadtong ${visitDate}. Palihug balik sa ${smsCenterLabel()} sa Pinakaulahi para sa follow-up schedule.`;
  return highRisk ? `${base} ${HIGH_RISK_NOTE} Salamat!` : `${base} Salamat!`;
}

/**
 * Starter copy for the Broadcast Dispatch composer, matched to the selected
 * message type. [Ngalan] and [Petsa] are filled per recipient on the server
 * from the mother's record, so staff never type names or dates by hand.
 */
export function broadcastTemplate(messageType: string, center: string): string {
  switch (messageType) {
    case 'prenatal_reminder':
      return `Maayong adlaw, [Ngalan]! Ang ${center} kini. Pahinumdom lang nga ang imong sunod nga prenatal check-up kay sa [Petsa]. Ayaw kalimot sa pag-adto sa health center sa maong petsa aron masusi ang imong kahimtang ug ang kahimtang sa imong baby. Amping kanunay!`;
    case 'missed_visit_follow_up':
      return `Maayong adlaw, [Ngalan]! Ang ${center} kini. Among namatikdan nga wala ka nakaadto sa imong gitakdang prenatal check-up niadtong [Petsa]. Gihangyo ka namo nga mo-adto sa among health center sulod sa oras sa among serbisyo aron makapahimo sa imong prenatal check-up. Importante ang imong kahimsog ug ang kahimsog sa imong baby. Salamat!`;
    case 'risk_alert':
      return `Maayong adlaw, [Ngalan]! Ang ${center} kini. Base sa imong kataposang pagsusi, gikinahanglan nga mobalik ka sa health center aron masusi pag-usab ang imong kahimtang. Palihug pakigkita sa among midwife sa.labing dali nga panahon alang sa dugang nga pagsusi ug tambag. Amping kanunay!`;
    case 'general':
      return `Maayong adlaw, [Ngalan]! Ang ${center} kini. Adunay pahinumdom kami kanimo nga ampingan kanunay ang imong panglawas ug ayaw kalimot sa regular nga pagpacheck-up. Kung adunay mga pangutana o kabalaka, mahimo kang moduol sa among health center. Salamat!`;
    default:
      return '';
  }
}

/** Replaces the [Ngalan] and [Petsa] placeholders in a broadcast draft. */
export function fillBroadcastPlaceholders(
  message: string,
  vars: { name?: string | null; date?: string | null },
): string {
  return message
    .replaceAll('[Ngalan]', vars.name?.trim() || 'kaigsuonan')
    .replaceAll('[Petsa]', vars.date?.trim() || 'among gitakdang petsa');
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
