/**
 * Where the barangay health center is, as shown inside SMS copy.
 *
 * Configure with PRENATAL_CENTER_NAME and PRENATAL_CENTER_ADDRESS. Without an
 * address the messages keep the old generic wording.
 */
export function smsCenterName(): string {
  return (process.env.PRENATAL_CENTER_NAME ?? '').trim() || 'Barangay Health Center';
}

export function smsCenterAddress(): string {
  return (process.env.PRENATAL_CENTER_ADDRESS ?? '').trim();
}

/** "Barangay Health Center, Purok 3, Brgy. Sample" or just the center name. */
export function smsCenterLabel(): string {
  const address = smsCenterAddress();
  return address ? `${smsCenterName()}, ${address}` : smsCenterName();
}
