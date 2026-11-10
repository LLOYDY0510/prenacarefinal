/* Philippine mobile number normalisation for SMS providers. */

const PH_MOBILE = /^9\d{9}$/;

export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;

  let digits = String(input).replace(/[^0-9]/g, '');

  // Trim a leading 00 international prefix.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Already international: 63 + 9XXXXXXXXX
  if (digits.startsWith('63') && digits.length === 12) {
    return `+${digits}`;
  }

  // Local: 09XXXXXXXXX (11 digits)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (PH_MOBILE.test(digits)) {
    return `+63${digits}`;
  }

  return null;
}

export function isValidMobileNumber(input: string | null | undefined): boolean {
  return toE164(input) !== null;
}

/* Formats a number for the Semaphore API as 639XXXXXXXXXX (no leading +). */
export function toSemaphoreFormat(input: string | null | undefined): string | null {
  const e164 = toE164(input);
  if (!e164) return null;
  return e164.replace(/^\+/, '');
}

export type SemaphoreNumberFormat = 'plus63' | '63';

/**
 * Payload-only number format switch (SEMAPHORE_NUMBER_FORMAT).
 *
 *  - "plus63" (default): send +639XXXXXXXXX.
 *  - "63": send 639XXXXXXXXX via toSemaphoreFormat().
 *
 * Matching, dedupe keys and UI stay on toE164() regardless.
 */
export function semaphoreNumberFormat(): SemaphoreNumberFormat {
  return process.env.SEMAPHORE_NUMBER_FORMAT?.trim() === '63' ? '63' : 'plus63';
}

/** Applies semaphoreNumberFormat() to an already-normalised +63 number. */
export function formatNumberForPayload(e164: string): string {
  return semaphoreNumberFormat() === '63' ? e164.replace(/^\+/, '') : e164;
}

/** Renders a number for the UI, e.g. +63 938 920 1440. */
export function formatE164(e164: string | null | undefined): string {
  if (!e164) return '—';
  const digits = e164.replace(/[^\d]/g, '');
  if (digits.length !== 12 || !digits.startsWith('63')) return e164;
  return `+63 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}
