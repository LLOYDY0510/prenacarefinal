export function normalizeZone(value: unknown): string | null {
  if(typeof value!=='string') return null;
  const zone=value.trim().replace(/^(zone|purok)\s*/i,'');
  return /^[1-8]$/.test(zone)?zone:null;
}
