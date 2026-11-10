export function canEmailRecipient(address: string | null | undefined): boolean {
  const match = address?.trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  if (!match) return false;
  const domain = match[1];
  return !/(^|\.)(invalid|test|localhost)$/.test(domain) && !/(^|\.)example\.(com|net|org)$/.test(domain);
}
