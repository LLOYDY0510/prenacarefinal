export function normalizeSearch(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function matchesSearch(query: unknown, ...values: unknown[]): boolean {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  const text = normalizeSearch(values.flat().join(' '));
  return terms.every(term => text.includes(term));
}
