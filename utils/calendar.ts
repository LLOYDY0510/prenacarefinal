export function localDate(days = 0, now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(value: string, days: number): string | null {
  if (!validDate(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function gravida(value: string | null | undefined): number | null {
  const match = value?.match(/^G(\d+)P\d+$/i);
  return match ? Number(match[1]) : null;
}
